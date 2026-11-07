/**
 * @file plugins/chimerax-console/worker/commands/lookCommands.ts
 * @description `lighting`, `camera`, `preset`, `ribbon` and `unitcell outline`.
 *
 * `lighting` is the one place the console approximates instead of refusing:
 * CueMol has no light directions, intensities or shadows, only screen-space
 * ambient occlusion (the scene's `aoEnabled`) and outlines. ChimeraX's
 * presets (`std_commands/lighting.py`) are mapped onto those, and every one
 * that CueMol cannot draw the same says what differs.
 *
 * `preset` runs ChX commands, as ChimeraX's presets run ChimeraX commands
 * (`preset_mgr`); the Initial Styles reset the surfaces and apply the
 * automatic styling with the style named (`atomic/presets.py`).
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { objectNodes, rendererNodesOf } from '@renderer/worker/server/catalog/refs'
import { getGenericProps } from '@renderer/worker/server/services/props/read'
import type { CmdContext, CmdOutcome } from '@plugins/console/worker/dialect-api'
import { BoolArg, EnumOf, IntArg, RestOfLine, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { applyAutoStyle } from '../autoStyle'
import type { AutoStyle } from '../autoStyle'
import { atomRenderers, ensureOwned, intersect, minus, readSel, runOp, union, writeSel } from '../display'
import { isMolecule, numberedObjects } from '../models'
import { hideSurfaces } from '../surface'
import { runChxLines } from './aliasCommands'
import { objectsOf } from './fileCommands'
import { silhouettes } from './viewCommands'
import { warnIgnored } from './warn'

// --- lighting ---

const LIGHTING_PRESETS = ['default', 'full', 'soft', 'gentle', 'simple', 'flat'] as const

/** What CueMol cannot draw of each preset, said when it is used. */
const LIGHTING_DIFFERS: Readonly<Record<string, string>> = {
  soft: 'approximated by ambient occlusion; the directional lights stay on (CueMol cannot turn them off)',
  gentle: 'approximated by ambient occlusion; the directional lights stay on (CueMol cannot turn them off)',
  full: 'approximated by ambient occlusion; there are no shadows, and the light intensities are not changed',
  flat: 'approximated by outlines without ambient occlusion; the surfaces keep their shading',
}

const LIGHTING_IGNORED = [
  'intensity', 'direction', 'color', 'fillIntensity', 'fillDirection', 'fillColor', 'ambientIntensity', 'ambientColor',
  'depthCueStart', 'depthCueEnd', 'depthCueColor', 'moveWithCamera', 'msMapSize', 'msDepthBias', 'qualityOfShadows',
]

/** Turn the scene's ambient occlusion on or off. */
function setAo(ctx: WorkerContext, cc: CmdContext, on: boolean) {
  return runOp(ctx, cc, 'set_node_prop', { nodeType: 'scene', nodeId: null, prop: 'aoEnabled', value: on ? 'true' : 'false' })
}

const lighting = chxCommand({
  words: ['lighting'],
  args: [
    { name: 'preset', type: EnumOf(LIGHTING_PRESETS), role: 'optional' },
    { name: 'shadows', type: BoolArg, role: 'keyword' },
    { name: 'multiShadow', type: IntArg, role: 'keyword' },
    { name: 'depthCue', type: BoolArg, role: 'keyword' },
    ...LIGHTING_IGNORED.map((name) => ({ name, type: StringArg, role: 'keyword' as const, ignored: true })),
  ],
  mutates: true,
  summary: 'Set the lighting (approximated: ambient occlusion on or off, and outlines for flat).',
  async run(ctx, args, cc): Promise<CmdOutcome> {
    warnIgnored(cc, 'lighting', args, LIGHTING_IGNORED)
    const given = Object.entries(args).some(([k, v]) => v !== '' && !LIGHTING_IGNORED.includes(k))
    if (!given) {
      const props = getGenericProps(ctx, { sceneId: cc.sceneId, nodeId: cc.sceneId, nodeType: 'scene' })
      const ao = props.ok ? props.entries.find((e) => e.key === 'aoEnabled')?.value === true : false
      cc.print(`Ambient occlusion: ${ao ? 'on' : 'off'} (CueMol's lighting has no other settings)`)
      return { ok: true }
    }
    const preset = args.preset
    if (preset !== '') {
      if (LIGHTING_DIFFERS[preset]) cc.warn(`lighting: ${preset} is ${LIGHTING_DIFFERS[preset]}`)
      const res = await setAo(ctx, cc, preset === 'soft' || preset === 'gentle' || preset === 'full')
      if (!res.ok) return res
      if (preset === 'flat') {
        const sil = await silhouettes(ctx, cc, 'lighting', 'true', '', '')
        if (!sil.ok) return sil
      }
    }
    if (args.multiShadow !== '') {
      const on = Number(args.multiShadow) > 0
      if (on) cc.warn('lighting: multiShadow is approximated by ambient occlusion (the number of directions is not used)')
      const res = await setAo(ctx, cc, on)
      if (!res.ok) return res
    }
    if (args.shadows === 'true') cc.warn('lighting: shadows are not supported (CueMol draws no shadows); ignored')
    if (args.depthCue === 'true') cc.warn('lighting: depthCue is not supported (CueMol has no depth cueing); ignored')
    return { ok: true }
  },
})

// --- camera ---

const CAMERA_MODES = ['mono', 'ortho', '360', '360tb', '360sbs', 'dome', 'sbs', 'tb', 'stereo', 'crosseye', 'walleye']

const camera = chxCommand({
  words: ['camera'],
  args: [
    { name: 'type', type: EnumOf(CAMERA_MODES), role: 'optional' },
    { name: 'fieldOfView', type: StringArg, role: 'keyword' },
    { name: 'eyeSeparation', type: StringArg, role: 'keyword', ignored: true },
    { name: 'pixelEyeSeparation', type: StringArg, role: 'keyword', ignored: true },
    { name: 'convergence', type: StringArg, role: 'keyword', ignored: true },
    { name: 'cubeMapSize', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: false,
  summary: 'Set the projection: mono (perspective) or ortho (orthographic).',
  async run(ctx, args, cc): Promise<CmdOutcome> {
    warnIgnored(cc, 'camera', args, ['eyeSeparation', 'pixelEyeSeparation', 'convergence', 'cubeMapSize'])
    if (args.fieldOfView !== '') return { ok: false, error: 'Error: camera: fieldOfView is not supported (CueMol sets the view by its zoom)' }
    if (args.type === '') {
      const res = await runOp(ctx, cc, 'set_projection', { perspective: null })
      if (!res.ok) return res
      const persp = (res.data as { perspective?: boolean } | undefined)?.perspective
      cc.print(`Camera parameters: type ${persp === false ? 'ortho' : 'mono'}`)
      return { ok: true }
    }
    if (args.type !== 'mono' && args.type !== 'ortho') {
      return { ok: false, error: `Error: camera: ${args.type} is not supported (mono and ortho only)` }
    }
    const res = await runOp(ctx, cc, 'set_projection', { perspective: args.type === 'mono' })
    return res.ok ? { ok: true } : res
  },
})

// --- ribbon ---

/** `ribbon ...` / `~ribbon ...`: ChimeraX's aliases of `cartoon` / `cartoon hide` (`std_commands/ribbon.py`). */
function ribbonAlias(words: string[], target: string): ChxCommand {
  return chxCommand({
    words,
    args: [{ name: 'rest', type: RestOfLine, role: 'optional' }],
    mutates: false,
    summary: `The same as ${target}.`,
    run: (ctx, args, cc) => runChxLines(ctx, cc, `${target} ${args.rest}`.trim(), words.join(' ')),
  })
}

// --- unitcell ---

const unitcellOutline = chxCommand({
  words: ['unitcell', 'outline'],
  args: [
    { name: 'structures', type: SpecArg, role: 'optional' },
    { name: 'close', type: BoolArg, role: 'keyword' },
    { name: 'origin', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: true,
  summary: 'Draw the unit cell box of crystal structures and maps (close true removes it).',
  async run(ctx, args, cc): Promise<CmdOutcome> {
    warnIgnored(cc, 'unitcell outline', args, ['origin'])
    const found = objectsOf(ctx, cc.sceneId, args.structures)
    if (!found.ok) return found
    let done = 0
    for (const o of found.objs) {
      if (args.close === 'true') {
        const node = objectNodes(ctx, cc.sceneId).find((n) => n.id === o.uid)
        for (const r of node ? rendererNodesOf(node) : []) {
          const props = getGenericProps(ctx, { sceneId: cc.sceneId, nodeId: r.id, nodeType: 'renderer' })
          if (!props.ok || props.entries.find((e) => e.key === 'type_name')?.value !== '*unitcell') continue
          const res = await runOp(ctx, cc, 'delete_node', { nodeId: r.id, nodeType: 'renderer' })
          if (!res.ok) return res
          done++
        }
        continue
      }
      // Only objects with crystal information have a cell; the others are skipped, as in ChimeraX.
      const res = await runOp(ctx, cc, 'show_unit_cell', { objId: o.uid })
      if (res.ok) done++
    }
    if (done === 0 && args.close !== 'true') return { ok: false, error: 'Error: unitcell outline: no model with crystal information (a unit cell)' }
    return { ok: true }
  },
})

/** `unitcell` and `unitcell delete` fill the cell with copies of a model: refused. */
function unitcellCopies(words: string[]): ChxCommand {
  return chxCommand({
    words,
    args: [{ name: 'rest', type: RestOfLine, role: 'optional' }],
    mutates: false,
    summary: 'Not supported: fills the unit cell with copies of a model (use unitcell outline for the box).',
    run: () => ({
      ok: false,
      error: `Error: ${words.join(' ')} is not supported (it makes copies of the model to fill the unit cell, which CueMol does not; unitcell outline draws the box)`,
    }),
  })
}

// --- preset ---

/**
 * ChimeraX's `style (protein|nucleic|solvent) & @@draw_mode=0 stick` (the
 * presets' `nospheres`): the polymer and solvent atoms shown as spheres
 * become sticks.
 */
async function noSpheres(ctx: WorkerContext, cc: CmdContext): Promise<CmdOutcome> {
  for (const obj of numberedObjects(ctx, cc.sceneId).filter(isMolecule)) {
    const owned = await ensureOwned(ctx, cc, obj)
    if (!owned.ok) return owned
    const r = atomRenderers(owned.ids)
    const moved = intersect(readSel(ctx, cc.sceneId, r.sphere), '(protein or nucleic or water)')
    const writes: [number, string][] = [
      [r.stick, union(readSel(ctx, cc.sceneId, r.stick), moved)],
      [r.sphere, minus(readSel(ctx, cc.sceneId, r.sphere), moved)],
    ]
    for (const [id, next] of writes) {
      const w = await writeSel(ctx, cc, id, next)
      if (!w.ok) return w
    }
  }
  return { ok: true }
}

/** An Initial Style (`atomic/presets.py` `_execute`): surfaces hidden, then the automatic styling. */
function initialStyle(style: AutoStyle | undefined) {
  return async (ctx: WorkerContext, cc: CmdContext): Promise<CmdOutcome> => {
    for (const obj of numberedObjects(ctx, cc.sceneId).filter(isMolecule)) {
      const hidden = await hideSurfaces(ctx, cc, { obj, sel: '*' })
      if (!hidden.ok) return hidden
      const styled = await applyAutoStyle(ctx, cc, obj, style)
      if (!styled.ok) return styled
    }
    return { ok: true }
  }
}

/** What a preset does: ChX commands, code, or a refusal with the reason. */
type PresetAction =
  | { run: (ctx: WorkerContext, cc: CmdContext) => Promise<CmdOutcome>; then?: string }
  | { refuse: string }

const NO_NUCLEOTIDES = 'it needs the nucleotides command and helix tubes, which the console does not have'

/** ChimeraX's builtin presets (`atomic` and `preset_mgr` bundles), by category, in order. */
const PRESETS: Readonly<Record<string, Readonly<Record<string, PresetAction>>>> = {
  'Initial Styles': {
    'Original Look': { run: initialStyle(undefined) },
    'Sticks': { run: initialStyle('non-polymer') },
    'Cartoon': { run: initialStyle('small polymer') },
    'Space-Filling (chain colors)': { run: initialStyle('medium polymer') },
    'Space-Filling (single color)': { run: initialStyle('large polymer') },
  },
  'Cartoons/Nucleotides': {
    'ribbons/slabs': { refuse: NO_NUCLEOTIDES },
    'cylinders/stubs': { refuse: NO_NUCLEOTIDES },
    'licorice/ovals': { refuse: NO_NUCLEOTIDES },
  },
  'Molecular Surfaces': {
    'ghostly white': { run: noSpheres, then: 'surface; color white target s; transparency 80 target s' },
    'atomic coloring (transparent)': { refuse: 'it colours surfaces from the atoms (color fromatoms), which the console does not do' },
    'chain ID coloring (opaque)': { run: noSpheres, then: 'surface; color bychain target s; transparency 0 target s' },
  },
  'Overall Look': {
    'publication 1 (silhouettes)': { run: async () => ({ ok: true }), then: 'set bgColor white; graphics silhouettes true; lighting depthCue false' },
    'publication 2 (depth-cued)': { run: async () => ({ ok: true }), then: 'set bgColor white; graphics silhouettes false; lighting depthCue true' },
    'interactive': { run: async () => ({ ok: true }), then: 'set bgColor black; graphics silhouettes false; lighting depthCue true' },
  },
}

/**
 * The names `query` matches (`preset_mgr/cmd.py` `text_match`): an exact
 * name (case ignored) alone; else those it starts; else those containing it.
 */
export function textMatch(query: string, targets: readonly string[]): string[] {
  const q = query.toLowerCase()
  const exact = targets.find((t) => t.toLowerCase() === q)
  if (exact) return [exact]
  const begins = targets.filter((t) => t.toLowerCase().startsWith(q))
  return begins.length > 0 ? begins : targets.filter((t) => t.toLowerCase().includes(q))
}

/** The preset `text1 [text2]` names (`preset_cmd`), or why none. */
export function findPreset(text1: string, text2: string): { category: string; name: string } | { error: string } {
  const unquote = (t: string) => t.trim().replace(/^(["'])(.*)\1$/, '$2')
  const all = Object.entries(PRESETS).flatMap(([category, names]) => Object.keys(names).map((name) => ({ category, name })))
  const matchAll = (text: string) => {
    const hits = textMatch(text, all.map((p) => p.name))
    if (hits.length === 0) return { error: `Error: preset: no preset name matches '${text}'` }
    if (hits.length > 1) return { error: `Error: preset: multiple preset names match '${text}': ${hits.join('; ')}` }
    return all.find((p) => p.name === hits[0]) as { category: string; name: string }
  }
  if (text2.trim() === '') return matchAll(unquote(text1))
  const cats = textMatch(unquote(text1), Object.keys(PRESETS))
  if (cats.length === 0) return matchAll(`${unquote(text1)} ${unquote(text2)}`)
  if (cats.length > 1) return { error: `Error: preset: multiple preset category names match '${text1}': ${cats.join('; ')}` }
  const names = textMatch(unquote(text2), Object.keys(PRESETS[cats[0]]))
  if (names.length === 0) return { error: `Error: preset: no preset name in category '${cats[0]}' matches '${unquote(text2)}'` }
  if (names.length > 1) return { error: `Error: preset: multiple preset names in category '${cats[0]}' match '${unquote(text2)}': ${names.join('; ')}` }
  return { category: cats[0], name: names[0] }
}

const preset = chxCommand({
  words: ['preset'],
  args: [
    { name: 'text1', type: StringArg, role: 'required' },
    { name: 'text2', type: RestOfLine, role: 'optional' },
  ],
  mutates: true,
  summary: 'Apply one of ChimeraX\'s builtin presets (Initial Styles, Molecular Surfaces, Overall Look).',
  async run(ctx, args, cc): Promise<CmdOutcome> {
    const found = findPreset(args.text1, args.text2)
    if ('error' in found) return { ok: false, error: found.error }
    const action = PRESETS[found.category][found.name]
    if ('refuse' in action) return { ok: false, error: `Error: preset ${found.name} is not supported (${action.refuse})` }
    cc.print(`Using preset: ${found.category} / ${found.name}`)
    const done = await action.run(ctx, cc)
    if (!done.ok || !action.then) return done
    return runChxLines(ctx, cc, action.then, `preset ${found.name}`, 'a preset')
  },
})

export const LOOK_COMMANDS: Record<string, ChxCommand> = {
  camera,
  lighting,
  ribbon: ribbonAlias(['ribbon'], 'cartoon'),
  unribbon: ribbonAlias(['~ribbon'], 'cartoon hide'),
  preset,
  unitcell: unitcellCopies(['unitcell']),
  unitcellOutline,
  unitcellDelete: unitcellCopies(['unitcell', 'delete']),
}
