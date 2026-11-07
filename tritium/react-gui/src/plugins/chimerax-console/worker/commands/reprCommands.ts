/**
 * @file plugins/chimerax-console/worker/commands/reprCommands.ts
 * @description `surface` (with `hidePatches` / `close`, `~surface`),
 * `transparency`, and `label` (with `delete`, `~label`).
 *
 * Surfaces are the per-chain `dsurface` renderers of `surface.ts`.
 *
 * Transparency is a renderer's `alpha` in CueMol, one value for everything
 * the renderer draws, where ChimeraX has one per atom: so it is set for
 * whole molecules only, and a specification that picks part of one is
 * refused rather than made to cover more than it says.
 *
 * Labels are name labels on two renderers per molecule,
 * `chx:label:residues` and `chx:label:atoms`. A residue label is put on one
 * atom of the residue (CA, else C4', else its first atom), as CueMol labels
 * atoms only.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome } from '@plugins/console/worker/dialect-api'
import { BoolArg, ColorArg, EnumOf, FloatArg, ListOf, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { splitColorArg } from '../colors'
import { atomRenderers, cartoonRenderers, ensureOwned, ensurePaint, forEachAtom, ownedOn, runOp, targetsOf } from '../display'
import type { Target } from '../display'
import { closeSurfaces, encloseSurface, hideSurfaces, showSurfaces, surfacesOn } from '../surface'
import { warnIgnored } from './warn'

// --- surface ---

/** Paint `sel` with `hex` first in each of `ids`' paint tables. */
async function paint(ctx: WorkerContext, cc: CmdContext, ids: readonly number[], sel: string, hex: string): Promise<CmdOutcome> {
  for (const id of ids) {
    const painted = await ensurePaint(ctx, cc, id)
    if (!painted.ok) return painted
    const res = await runOp(ctx, cc, 'add_paint_at', { nodeId: id, nodeType: 'renderer', selection: sel, color: hex, at: 1 })
    if (!res.ok) return res
  }
  return { ok: true }
}

/** Set one renderer property on each of `ids`. */
async function setEach(ctx: WorkerContext, cc: CmdContext, ids: readonly number[], prop: string, value: string): Promise<CmdOutcome> {
  for (const id of ids) {
    const res = await runOp(ctx, cc, 'set_node_prop', { nodeType: 'renderer', nodeId: id, prop, value })
    if (!res.ok) return res
  }
  return { ok: true }
}

/** The alpha a ChimeraX transparency percentage means. */
export function alphaOf(percent: number): string {
  return String(Math.min(1, Math.max(0, 1 - percent / 100)))
}

const SURFACE_IGNORED = ['include', 'gridSpacing', 'resolution', 'level', 'visiblePatches', 'sharpBoundaries', 'nthread', 'replace', 'update']

const surface = chxCommand({
  words: ['surface'],
  args: [
    { name: 'atoms', type: SpecArg, role: 'optional' },
    { name: 'enclose', type: SpecArg, role: 'keyword' },
    { name: 'probeRadius', type: FloatArg, role: 'keyword' },
    { name: 'color', type: ColorArg, role: 'keyword' },
    { name: 'transparency', type: FloatArg, role: 'keyword' },
    ...SURFACE_IGNORED.map((name) => ({ name, type: StringArg, role: 'keyword' as const, ignored: true })),
  ],
  mutates: true,
  summary: 'Show the molecular surface of each chain (or one around the atoms given with enclose).',
  async run(ctx, args, cc) {
    warnIgnored(cc, 'surface', args, SURFACE_IGNORED)
    const enclose = args.enclose !== ''
    const found = targetsOf(ctx, cc.sceneId, enclose ? args.enclose : args.atoms)
    if (!found.ok) return found
    for (const t of found.targets) {
      const shown = enclose ? await encloseSurface(ctx, cc, t) : await showSurfaces(ctx, cc, t)
      if (!shown.ok) return shown
      if (args.probeRadius !== '') {
        const r = await setEach(ctx, cc, shown.ids, 'proberad', args.probeRadius)
        if (!r.ok) return r
      }
      if (args.color !== '') {
        const r = await paint(ctx, cc, shown.ids, t.sel, splitColorArg(args.color).hex)
        if (!r.ok) return r
      }
      if (args.transparency !== '') {
        const r = await setEach(ctx, cc, shown.ids, 'alpha', alphaOf(Number(args.transparency)))
        if (!r.ok) return r
      }
    }
    return { ok: true }
  },
})

/** `surface hidePatches` / `~surface`: hide the patches of the atoms given. */
function hidePatchesCommand(words: string[]): ChxCommand {
  return chxCommand({
    words,
    args: [{ name: 'atoms', type: SpecArg, role: 'optional' }],
    mutates: true,
    summary: 'Hide the surface patches of atoms.',
    async run(ctx, args, cc) {
      const found = targetsOf(ctx, cc.sceneId, args.atoms)
      if (!found.ok) return found
      for (const t of found.targets) {
        const r = await hideSurfaces(ctx, cc, t)
        if (!r.ok) return r
      }
      return { ok: true }
    },
  })
}

const surfaceClose = chxCommand({
  words: ['surface', 'close'],
  args: [{ name: 'atoms', type: SpecArg, role: 'optional' }],
  mutates: true,
  summary: 'Delete the surfaces of the chains the atoms are in.',
  async run(ctx, args, cc) {
    const found = targetsOf(ctx, cc.sceneId, args.atoms)
    if (!found.ok) return found
    for (const t of found.targets) {
      const r = await closeSurfaces(ctx, cc, t)
      if (!r.ok) return r
    }
    return { ok: true }
  },
})

// --- transparency ---

/** What `transparency` can act on, as target letters (`transparency.py`). */
const WHAT_LETTERS: Readonly<Record<string, string>> = {
  all: 'acs', atoms: 'a', bonds: 'a', cartoons: 'c', ribbons: 'c', surfaces: 's',
}

/** The console renderers target letters name on a molecule (a, b atoms; c, r cartoons; s surfaces). */
export function transparencyRenderers(ctx: WorkerContext, sceneId: number, ids: Map<string, number>, objUid: number, target: string): number[] {
  const out: number[] = []
  if (/[ab]/.test(target)) {
    const r = atomRenderers(ids)
    out.push(r.stick, r.ball, r.sphere)
  }
  if (/[cr]/.test(target)) out.push(...cartoonRenderers(ids).map((c) => c.id))
  if (/s/.test(target)) out.push(...surfacesOn(ctx, sceneId, objUid).map((s) => s.id))
  return out.filter((id) => id !== undefined)
}

const transparency = chxCommand({
  words: ['transparency'],
  args: [
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'percent', type: FloatArg, role: 'optional' },
    { name: 'what', type: ListOf(EnumOf(Object.keys(WHAT_LETTERS))), role: 'optional' },
    { name: 'target', type: StringArg, role: 'keyword' },
  ],
  mutates: true,
  summary: 'Make surfaces (or atoms, cartoons) of whole models transparent, 0-100 percent.',
  async run(ctx, args, cc) {
    if (args.percent === '') return { ok: false, error: 'Error: transparency: give a percentage (0-100)' }
    const fromWhat = args.what === '' ? '' : args.what.split(',').map((w) => WHAT_LETTERS[w]).join('')
    const target = args.target !== '' ? args.target : fromWhat !== '' ? fromWhat : 's'
    const bad = [...target].find((ch) => !'abcrs'.includes(ch))
    if (bad !== undefined) return { ok: false, error: `Error: transparency: target "${bad}" is not supported (a b c r s)` }
    const found = targetsOf(ctx, cc.sceneId, args.objects)
    if (!found.ok) return found
    const part = found.targets.find((t) => t.sel !== '*')
    if (part) {
      return {
        ok: false,
        error: `Error: transparency: "${args.objects}" is part of #${part.obj.model}; CueMol sets transparency per representation, so give whole models`,
      }
    }
    const alpha = alphaOf(Number(args.percent))
    for (const t of found.targets) {
      const owned = /[abcr]/.test(target) ? await ensureOwned(ctx, cc, t.obj) : { ok: true as const, ids: ownedOn(ctx, cc.sceneId, t.obj.uid) }
      if (!owned.ok) return owned
      const r = await setEach(ctx, cc, transparencyRenderers(ctx, cc.sceneId, owned.ids, t.obj.uid, target), 'alpha', alpha)
      if (!r.ok) return r
    }
    return { ok: true }
  },
})

// --- label ---

const LABEL_RENDERERS = { residues: 'chx:label:residues', atoms: 'chx:label:atoms' } as const
type LabelKind = keyof typeof LABEL_RENDERERS

/** The label format fields ChimeraX attributes map to, by label kind. */
const LABEL_FIELDS: Readonly<Record<LabelKind, Readonly<Record<string, string>>>> = {
  residues: { name: '{resn}', number: '{resi}', chain_id: '{chain}' },
  // A real attribute is written to 3 significant digits, as ChimeraX's `"%.3g" % value`.
  atoms: { name: '{name}', element: '{elem}', bfactor: '{bfac:.3g}', occupancy: '{occ:.3g}', alt_loc: '{alt}' },
}

const DEFAULT_FORMAT: Readonly<Record<LabelKind, string>> = { residues: '{resn} {resi}', atoms: '{name}' }

/** One atom per residue that a residue label hangs on: CA, else C4', else the residue's first atom. */
export function residueAnchors(atoms: Iterable<{ id: number; name: string; chainName: string; residIndex: string }>): number[] {
  const pick = new Map<string, { id: number; rank: number }>()
  for (const a of atoms) {
    const key = `${a.chainName}:${a.residIndex}`
    const rank = a.name === 'CA' ? 0 : a.name === "C4'" ? 1 : 2
    const cur = pick.get(key)
    if (!cur || rank < cur.rank) pick.set(key, { id: a.id, rank })
  }
  return [...pick.values()].map((p) => p.id)
}

/** The atoms a label of `kind` goes on in a target, as a selection; null for none. */
function labelSel(ctx: WorkerContext, sceneId: number, t: Target, kind: LabelKind): string | null {
  if (kind === 'atoms') return t.sel
  const atoms: { id: number; name: string; chainName: string; residIndex: string }[] = []
  // An atom named (`/A:10@CB`) labels its residue, as in ChimeraX: widen to whole residues first.
  const residues = t.sel === '*' ? '*' : `byres (${t.sel})`
  forEachAtom(ctx, sceneId, t.obj.uid, residues, (a) => {
    atoms.push({ id: a.id, name: a.name, chainName: a.chainName, residIndex: a.residIndex })
  })
  const ids = residueAnchors(atoms)
  return ids.length === 0 ? null : `aid ${ids.join(',')}`
}

/** A label format: literal text (braces escaped), an attribute, or the default. */
function formatOf(kind: LabelKind, text: string, attribute: string): { ok: true; format: string } | { ok: false; error: string } {
  if (text !== '') return { ok: true, format: text.replace(/[{}]/g, (b) => b + b) }
  if (attribute === '') return { ok: true, format: DEFAULT_FORMAT[kind] }
  const field = LABEL_FIELDS[kind][attribute]
  if (field === undefined) {
    return { ok: false, error: `Error: label: ${kind} attribute "${attribute}" is not supported (${Object.keys(LABEL_FIELDS[kind]).join(', ')})` }
  }
  return { ok: true, format: field }
}

const LABEL_IGNORED = ['height', 'bgColor', 'offset', 'font']
const LABEL_KINDS = ['atoms', 'residues', 'pseudobonds', 'bonds', 'models']

/** The label kind an argument names; residues when none. */
function kindOf(otype: string): { ok: true; kinds: LabelKind[] } | { ok: false; error: string } {
  if (otype === '') return { ok: true, kinds: ['residues'] }
  if (otype === 'atoms' || otype === 'residues') return { ok: true, kinds: [otype] }
  return { ok: false, error: `Error: label: ${otype} labels are not supported` }
}

const label = chxCommand({
  words: ['label'],
  args: [
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'otype', type: EnumOf(LABEL_KINDS), role: 'optional' },
    { name: 'text', type: StringArg, role: 'keyword' },
    { name: 'attribute', type: StringArg, role: 'keyword' },
    { name: 'color', type: ColorArg, role: 'keyword' },
    { name: 'size', type: FloatArg, role: 'keyword' },
    { name: 'onTop', type: BoolArg, role: 'keyword' },
    ...LABEL_IGNORED.map((name) => ({ name, type: StringArg, role: 'keyword' as const, ignored: true })),
  ],
  mutates: true,
  summary: 'Label residues (or atoms) with their name and number, a text, or an attribute.',
  async run(ctx, args, cc) {
    warnIgnored(cc, 'label', args, LABEL_IGNORED)
    const kinds = kindOf(args.otype)
    if (!kinds.ok) return kinds
    const kind = kinds.kinds[0]
    const fmt = formatOf(kind, args.text, args.attribute)
    if (!fmt.ok) return fmt
    const found = targetsOf(ctx, cc.sceneId, args.objects)
    if (!found.ok) return found
    for (const t of found.targets) {
      const sel = labelSel(ctx, cc.sceneId, t, kind)
      if (sel === null) continue
      const res = await runOp(ctx, cc, 'set_atom_labels', { objId: t.obj.uid, selection: sel, format: fmt.format, rendererName: LABEL_RENDERERS[kind] })
      if (!res.ok) return res
      const id = ownedOn(ctx, cc.sceneId, t.obj.uid).get(LABEL_RENDERERS[kind])
      if (id === undefined) continue
      const props: [string, string][] = [
        ...(args.color !== '' ? [['color', splitColorArg(args.color).hex] as [string, string]] : []),
        ...(args.size !== '' ? [['font_size', args.size] as [string, string]] : []),
        ...(args.onTop !== '' ? [['label_on_top', args.onTop] as [string, string]] : []),
      ]
      for (const [prop, value] of props) {
        const r = await setEach(ctx, cc, [id], prop, value)
        if (!r.ok) return r
      }
    }
    return { ok: true }
  },
})

/** `label delete` / `~label`: take labels off; both kinds when no kind is named. */
function labelDeleteCommand(words: string[]): ChxCommand {
  return chxCommand({
    words,
    args: [
      { name: 'objects', type: SpecArg, role: 'optional' },
      { name: 'otype', type: EnumOf(LABEL_KINDS), role: 'optional' },
    ],
    mutates: true,
    summary: 'Delete residue and atom labels.',
    async run(ctx, args, cc) {
      const kinds: LabelKind[] = args.otype === '' ? ['residues', 'atoms'] : []
      if (args.otype !== '') {
        const k = kindOf(args.otype)
        if (!k.ok) return k
        kinds.push(...k.kinds)
      }
      const found = targetsOf(ctx, cc.sceneId, args.objects)
      if (!found.ok) return found
      for (const t of found.targets) {
        for (const kind of kinds) {
          if (!ownedOn(ctx, cc.sceneId, t.obj.uid).has(LABEL_RENDERERS[kind])) continue
          // The residue label sits on one atom of the residue: take off every atom's.
          const sel = kind === 'residues' && t.sel !== '*' ? `byres (${t.sel})` : t.sel
          const res = await runOp(ctx, cc, 'set_atom_labels', { objId: t.obj.uid, selection: sel, format: null, rendererName: LABEL_RENDERERS[kind] })
          if (!res.ok) return res
        }
      }
      return { ok: true }
    },
  })
}

// --- size ---

/**
 * `size [spec] stickRadius r`: the stick radius of the `chx:stick` and
 * `chx:ball` bonds (`bondw`; a stick's atoms are as thick as its bonds).
 * `bondw` is one value per renderer, so whole molecules only, as for
 * transparency. `ballScale` and `atomRadius` are refused: CueMol's ball is
 * one radius for every element, so no factor on the atom radius, and a
 * per-atom radius has no renderer to go to.
 */
const size = chxCommand({
  words: ['size'],
  args: [
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'stickRadius', type: FloatArg, role: 'keyword' },
    { name: 'atomRadius', type: StringArg, role: 'keyword' },
    { name: 'ballScale', type: StringArg, role: 'keyword' },
    { name: 'pseudobondRadius', type: StringArg, role: 'keyword', ignored: true },
    { name: 'verbose', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: true,
  summary: 'Set the stick radius of whole molecules.',
  async run(ctx, args, cc) {
    warnIgnored(cc, 'size', args, ['pseudobondRadius', 'verbose'])
    if (args.ballScale !== '') return { ok: false, error: 'Error: size: ballScale is not supported (a CueMol ball has one radius for every element, not a factor on the atom radius)' }
    if (args.atomRadius !== '') return { ok: false, error: 'Error: size: atomRadius is not supported (CueMol has no radius per atom to set)' }
    if (args.stickRadius === '') return { ok: false, error: 'Error: size: give stickRadius' }
    const r = Number(args.stickRadius)
    if (!(r > 0)) return { ok: false, error: 'Error: size: stickRadius must be positive' }
    const found = targetsOf(ctx, cc.sceneId, args.objects)
    if (!found.ok) return found
    const part = found.targets.find((t) => t.sel !== '*')
    if (part) return { ok: false, error: `Error: size: the stick radius is set for whole models only (CueMol has one per renderer); "${args.objects}" is part of #${part.obj.model}` }
    for (const t of found.targets) {
      const owned = await ensureOwned(ctx, cc, t.obj)
      if (!owned.ok) return owned
      const ids = atomRenderers(owned.ids)
      const value = String(r)
      const res = await setEach(ctx, cc, [ids.stick, ids.ball], 'bondw', value)
      if (!res.ok) return res
      const sphere = await setEach(ctx, cc, [ids.stick], 'sphr', value)
      if (!sphere.ok) return sphere
    }
    return { ok: true }
  },
})

export const REPR_COMMANDS: Record<string, ChxCommand> = {
  size,
  surface,
  surfaceHidePatches: hidePatchesCommand(['surface', 'hidePatches']),
  surfaceClose,
  unsurface: hidePatchesCommand(['~surface']),
  transparency,
  label,
  labelDelete: labelDeleteCommand(['label', 'delete']),
  unlabel: labelDeleteCommand(['~label']),
}
