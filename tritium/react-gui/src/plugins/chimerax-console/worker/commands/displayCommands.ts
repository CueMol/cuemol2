/**
 * @file plugins/chimerax-console/worker/commands/displayCommands.ts
 * @description `show`, `hide`, `cartoon`, `cartoon hide` and `style`.
 *
 * Each reads the selections of the molecule's `chx:` renderers, combines
 * the specification in (show adds, hide takes away, as PyMOL's flags and
 * ChimeraX's display flags do), and writes them back with
 * `set_renderer_selection` (`display.ts`).
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome } from '@plugins/console/worker/dialect-api'
import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { BoolArg, EnumOf, FloatArg, ListOf, NoArg, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import {
  atomRenderers,
  cartoonRenderers,
  emitContext,
  ensureOwned,
  intersect,
  minus,
  readSel,
  runOp,
  targetsOf,
  union,
  writeSel,
} from '../display'
import type { AtomStyle, Target } from '../display'
import { numberedObjects } from '../models'
import { hideSurfaces, showSurfaces } from '../surface'
import { warnIgnored } from './warn'

/** What `show` / `hide` can act on (cli.py `WhatArg`). */
const WHAT = ['atoms', 'bonds', 'pseudobonds', 'pbonds', 'cartoons', 'ribbons', 'surfaces', 'models']

/** The parts a `target` string's letters name (`show.py` `TargetArg`). */
type Part = 'atoms' | 'cartoons' | 'models' | 'surfaces' | 'pseudobonds'

const LETTERS: Readonly<Record<string, Part>> = {
  a: 'atoms', b: 'atoms', c: 'cartoons', r: 'cartoons', m: 'models', s: 'surfaces', p: 'pseudobonds',
}

/** The parts a `what` list or `target` letters name; atoms when neither is given. */
function partsOf(what: string, target: string): { ok: true; parts: Set<Part> } | { ok: false; error: string } {
  const parts = new Set<Part>()
  for (const w of what === '' ? [] : what.split(',')) {
    if (w === 'atoms' || w === 'bonds') parts.add('atoms')
    else if (w === 'cartoons' || w === 'ribbons') parts.add('cartoons')
    else if (w === 'models') parts.add('models')
    else if (w === 'surfaces') parts.add('surfaces')
    else parts.add('pseudobonds')
  }
  for (const ch of target) {
    const p = LETTERS[ch]
    if (!p) return { ok: false, error: `Error: "${ch}" in target is not one of a b c m p r s` }
    parts.add(p)
  }
  if (parts.size === 0) parts.add('atoms')
  return { ok: true, parts }
}

/**
 * Show or hide `parts` of each target.
 *
 * @param only - `show ... only` (show.py): in each molecule reached, what is
 *   not in the specification is hidden (of the same parts), and with
 *   `models` every object of the scene not reached is hidden
 * @param wholeScene - the specification was empty, so `models only` has no
 *   other object to hide
 */
async function showHide(
  ctx: WorkerContext, cc: CmdContext, targets: readonly Target[], parts: Set<Part>, show: boolean,
  only = false, wholeScene = false,
): Promise<CmdOutcome> {
  if (parts.has('pseudobonds')) cc.warn(`${show ? 'show' : 'hide'}: pseudobonds are not supported yet; ignored`)
  for (const t of targets) {
    if (parts.has('models')) {
      const res = await runOp(ctx, cc, 'set_visible', { nodeId: t.obj.uid, nodeType: 'object', visible: show })
      if (!res.ok) return res
    }
    if (parts.has('surfaces')) {
      if (only && t.sel !== '*') {
        const res = await hideSurfaces(ctx, cc, { obj: t.obj, sel: `not (${t.sel})` })
        if (!res.ok) return res
      }
      // Show makes the surface of each chain reached; hide only edits the ones there are.
      const res = show ? await showSurfaces(ctx, cc, t) : await hideSurfaces(ctx, cc, t)
      if (!res.ok) return res
    }
    if (!parts.has('atoms') && !parts.has('cartoons')) continue
    const owned = await ensureOwned(ctx, cc, t.obj)
    if (!owned.ok) return owned
    if (parts.has('atoms')) {
      const r = atomRenderers(owned.ids)
      const sel = (id: number) => readSel(ctx, cc.sceneId, id)
      // With `only`, what each style shows outside the specification goes.
      const kept = (id: number) => (only ? intersect(sel(id), t.sel) : sel(id))
      const writes: [number, string][] = show
        // New atoms come in as sticks; atoms already shown keep their style.
        ? [
            [r.stick, union(kept(r.stick), minus(t.sel, union(sel(r.ball), sel(r.sphere))))],
            ...(only ? [r.ball, r.sphere].map((id): [number, string] => [id, kept(id)]) : []),
          ]
        : [r.stick, r.ball, r.sphere].map((id) => [id, minus(sel(id), t.sel)])
      for (const [id, next] of writes) {
        const w = await writeSel(ctx, cc, id, next)
        if (!w.ok) return w
      }
    }
    if (parts.has('cartoons')) {
      for (const c of cartoonRenderers(owned.ids)) {
        const cur = readSel(ctx, cc.sceneId, c.id)
        const next = show ? union(only ? intersect(cur, t.sel) : cur, intersect(t.sel, c.scope)) : minus(cur, t.sel)
        const w = await writeSel(ctx, cc, c.id, next)
        if (!w.ok) return w
      }
    }
  }
  if (only && parts.has('models') && !wholeScene) {
    // show_models(only=True): every model not specified is hidden.
    const reached = new Set(targets.map((t) => t.obj.uid))
    for (const o of numberedObjects(ctx, cc.sceneId)) {
      if (reached.has(o.uid)) continue
      const res = await runOp(ctx, cc, 'set_visible', { nodeId: o.uid, nodeType: 'object', visible: false })
      if (!res.ok) return res
    }
  }
  return { ok: true }
}

/** `show` / `hide`: [spec] [what], target, and for show `only`. */
function showHideCommand(show: boolean): ChxCommand {
  const word = show ? 'show' : 'hide'
  return chxCommand({
    words: [word],
    args: [
      { name: 'objects', type: SpecArg, role: 'optional' },
      { name: 'what', type: ListOf(EnumOf(WHAT)), role: 'optional' },
      { name: 'target', type: StringArg, role: 'keyword' },
      ...(show ? [{ name: 'only', type: NoArg, role: 'keyword' as const }] : []),
    ],
    mutates: true,
    summary: show ? 'Show atoms, cartoons, surfaces or models.' : 'Hide atoms, cartoons, surfaces or models.',
    async run(ctx, args, cc) {
      const parts = partsOf(args.what, args.target)
      if (!parts.ok) return parts
      const found = targetsOf(ctx, cc.sceneId, args.objects)
      if (!found.ok) return found
      return showHide(ctx, cc, found.targets, parts.parts, show, args.only === 'true', args.objects.trim() === '')
    },
  })
}

/** `cartoon` / `cartoon hide`: [spec]. */
function cartoonCommand(show: boolean): ChxCommand {
  return chxCommand({
    words: show ? ['cartoon'] : ['cartoon', 'hide'],
    args: [
      { name: 'atoms', type: SpecArg, role: 'optional' },
      ...(show
        ? [
            { name: 'smooth', type: StringArg, role: 'keyword' as const, ignored: true },
            { name: 'suppressBackboneDisplay', type: BoolArg, role: 'keyword' as const, ignored: true },
          ]
        : []),
    ],
    mutates: true,
    summary: show ? 'Show residues as cartoon.' : 'Hide the cartoon of residues.',
    async run(ctx, args, cc) {
      warnIgnored(cc, 'cartoon', args, ['smooth', 'suppressBackboneDisplay'])
      const found = targetsOf(ctx, cc.sceneId, args.atoms)
      if (!found.ok) return found
      return showHide(ctx, cc, found.targets, new Set(['cartoons']), show)
    },
  })
}

// --- cartoon style ---

/** A CueMol section shape: its `type`, and `sharp` where the shape takes one. */
interface SectionShape {
  type: string
  sharp?: number
}

/**
 * ChimeraX's piping (`ribbon.py` `_xsection_piping`): a flat band with a
 * round pipe along each edge, the pipes as thick as the section and the band
 * `ratio` (0.5) of that, joining the pipes at `asin(ratio)`. CueMol's
 * `fancy1` (`TubeSection::setupMolScrSection`) is built the same way, its
 * band joining at `180 sharp` degrees: `sharp = asin(0.5) / 180 deg = 1/6`.
 */
const PIPING: SectionShape = { type: 'fancy1', sharp: 1 / 6 }

/** ChimeraX's cross sections (`cartoon.py` `_XSectionMap`) as CueMol section shapes. */
const XSECTIONS: Readonly<Record<string, SectionShape>> = {
  rectangle: { type: 'rectangle' }, square: { type: 'rectangle' },
  oval: { type: 'elliptical' }, round: { type: 'elliptical' },
  barbell: PIPING, piping: PIPING,
}

/** A CueMol section `type` by ChimeraX's name for it, for the report (CueMol's own name otherwise). */
const XSECTION_NAMES: Readonly<Record<string, string>> = { rectangle: 'rectangle', elliptical: 'oval', fancy1: 'piping' }

/** The `cartoon style` options the console does not do yet (accepted, warned). */
const CARTOON_STYLE_IGNORED = [
  'arrows', 'arrowsHelix', 'arrowScale', 'sides', 'divisions', 'barScale', 'barSides', 'modeHelix', 'radius', 'worm',
]

/**
 * One cross section `cartoon style` sets: a renderer's TubeSection
 * property, and which residues make it apply (ChimeraX sets the style of
 * each secondary structure type the residues given include).
 */
interface SectionKind {
  label: 'helix' | 'strand' | 'coil' | 'nucleic'
  renderer: 'chx:cartoon' | 'chx:nucl'
  prop: 'helix' | 'sheet' | 'coil' | 'section'
  residues: string
}

const SECTION_KINDS: readonly SectionKind[] = [
  { label: 'helix', renderer: 'chx:cartoon', prop: 'helix', residues: '(protein) and (helix)' },
  { label: 'strand', renderer: 'chx:cartoon', prop: 'sheet', residues: '(protein) and (sheet)' },
  { label: 'coil', renderer: 'chx:cartoon', prop: 'coil', residues: '(protein) and not (helix or sheet)' },
  { label: 'nucleic', renderer: 'chx:nucl', prop: 'section', residues: 'nucleic' },
]

/** A number as a property value, without float noise. */
const num = (x: number): string => String(Number(x.toPrecision(6)))

/**
 * The full width and thickness (Angstrom) a CueMol section draws, as
 * ChimeraX names them. A section is `2 width` across its first axis and
 * `2 width tuber` across its second. ChimeraX's width is the second in both
 * renderers: the protein ribbon's wide side (DefaultRibbon: width 0.2,
 * tuber 6), and in `nucl` the side towards the bases, where ChimeraX turns
 * its nucleic section a quarter turn from the protein one (`cartoon.py`:
 * "Invert width and thickness"; `ribbon.py` `scale_nucleic = (0.2, 1.0)`).
 */
function sectionSize(lw: number, tuber: number): { width: number; thickness: number } {
  return { width: 2 * lw * tuber, thickness: 2 * lw }
}

/** The CueMol `width` / `tuber` that draw a section of full `width` x `thickness`. */
function sectionProps(width: number, thickness: number): { width: number; tuber: number } {
  return { width: thickness / 2, tuber: width / thickness }
}

const cartoonStyle = chxCommand({
  words: ['cartoon', 'style'],
  args: [
    { name: 'atoms', type: SpecArg, role: 'optional' },
    { name: 'width', type: FloatArg, role: 'keyword' },
    { name: 'thickness', type: FloatArg, role: 'keyword' },
    { name: 'xsection', type: EnumOf(Object.keys(XSECTIONS)), role: 'keyword' },
    ...CARTOON_STYLE_IGNORED.map((name) => ({ name, type: StringArg, role: 'keyword' as const, ignored: true })),
  ],
  mutates: true,
  summary: 'Set the cartoon cross section (width, thickness, xsection) of the secondary structure types named; report it with no option.',
  async run(ctx, args, cc) {
    warnIgnored(cc, 'cartoon style', args, CARTOON_STYLE_IGNORED)
    const width = args.width === '' ? null : Number(args.width)
    const thickness = args.thickness === '' ? null : Number(args.thickness)
    if ((width !== null && !(width > 0)) || (thickness !== null && !(thickness > 0))) {
      return { ok: false, error: 'Error: cartoon style: width and thickness must be positive' }
    }
    const shape = args.xsection === '' ? undefined : XSECTIONS[args.xsection]
    const report = width === null && thickness === null && shape === undefined
    const found = targetsOf(ctx, cc.sceneId, args.atoms)
    if (!found.ok) return found
    const ec = emitContext(ctx, cc.sceneId)
    for (const t of found.targets) {
      const owned = await ensureOwned(ctx, cc, t.obj)
      if (!owned.ok) return owned
      for (const kind of SECTION_KINDS) {
        if (!ec.anyHit(t.obj.model, intersect(t.sel, kind.residues))) continue
        const rendId = owned.ids.get(kind.renderer) as number
        const props = getGenericProps(ctx, { sceneId: cc.sceneId, nodeId: rendId, nodeType: 'renderer' })
        const read = (k: string) => (props.ok ? props.entries.find((e) => e.key === `${kind.prop}.${k}`)?.value : undefined)
        const size = sectionSize(Number(read('width')), Number(read('tuber')))
        if (report) {
          cc.print(`#${t.obj.model} ${kind.label} xsection ${XSECTION_NAMES[String(read('type'))] ?? String(read('type'))} width ${num(size.width)} thickness ${num(size.thickness)}`)
          continue
        }
        const writes: [string, string][] = []
        if (kind.label === 'coil') {
          // A coil is round, its diameter the thickness (`set_coil_scale(t, t)`).
          if (thickness !== null) writes.push(['width', num(thickness / 2)], ['tuber', '1'])
        } else if (width !== null || thickness !== null) {
          const p = sectionProps(width ?? size.width, thickness ?? size.thickness)
          writes.push(['width', num(p.width)], ['tuber', num(p.tuber)])
        }
        // ChimeraX leaves the coil as it is for piping (`cartoon.py`: `!= STYLE_PIPING`).
        if (shape !== undefined && !(kind.label === 'coil' && shape === PIPING)) {
          writes.push(['type', shape.type])
          if (shape.sharp !== undefined) writes.push(['sharp', num(shape.sharp)])
        }
        for (const [k, value] of writes) {
          const res = await runOp(ctx, cc, 'set_node_prop', { nodeType: 'renderer', nodeId: rendId, prop: `${kind.prop}.${k}`, value })
          if (!res.ok) return res
        }
      }
    }
    return { ok: true }
  },
})

const STYLES: readonly AtomStyle[] = ['stick', 'ball', 'sphere']

const style = chxCommand({
  words: ['style'],
  args: [
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'atomStyle', type: EnumOf(STYLES), role: 'optional' },
    { name: 'dashes', type: StringArg, role: 'keyword', ignored: true },
    { name: 'ringFill', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: true,
  summary: 'Draw atoms as stick, ball or sphere.',
  async run(ctx, args, cc) {
    warnIgnored(cc, 'style', args, ['dashes', 'ringFill'])
    const to = args.atomStyle as AtomStyle | ''
    if (to === '') return { ok: false, error: 'Error: style: give stick, ball or sphere' }
    const found = targetsOf(ctx, cc.sceneId, args.objects)
    if (!found.ok) return found
    for (const t of found.targets) {
      const owned = await ensureOwned(ctx, cc, t.obj)
      if (!owned.ok) return owned
      const r = atomRenderers(owned.ids)
      const others = STYLES.filter((s) => s !== to)
      const sel = (s: AtomStyle) => readSel(ctx, cc.sceneId, r[s])
      // Only atoms shown move: a hidden atom has no style to keep (display.ts).
      const moved = intersect(t.sel, union(sel(others[0]), sel(others[1])))
      const writes: [number, string][] = [
        [r[to], union(sel(to), moved)],
        ...others.map((s): [number, string] => [r[s], minus(sel(s), t.sel)]),
      ]
      for (const [id, next] of writes) {
        const w = await writeSel(ctx, cc, id, next)
        if (!w.ok) return w
      }
    }
    return { ok: true }
  },
})

export const DISPLAY_COMMANDS: Record<string, ChxCommand> = {
  show: showHideCommand(true),
  hide: showHideCommand(false),
  cartoon: cartoonCommand(true),
  cartoonHide: cartoonCommand(false),
  cartoonStyle,
  style,
}
