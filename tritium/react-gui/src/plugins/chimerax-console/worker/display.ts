/**
 * @file plugins/chimerax-console/worker/display.ts
 * @description What ChimeraX shows, as the console's own renderers.
 *
 * ChimeraX keeps a display flag and a style per atom and a ribbon flag per
 * residue. CueMol draws what a renderer's selection holds, so the ChX
 * console keeps one renderer per atom style and one for the ribbon on each
 * molecule, named `chx:...`, and those renderers' selections ARE the
 * display state: nothing about it is kept anywhere else. Each command reads
 * them, works out the new selections, and writes them back through ops, in
 * the submission's undo transaction -- so undo (from the console or the GUI)
 * puts back the state the next command reads, and an edit made in the GUI
 * is where the next command starts from. Renderers not named `chx:` are
 * never touched.
 *
 * All four are made together the first time the console touches a
 * molecule, so a colour given to "atoms" is in every atom renderer and stays
 * when an atom moves from one style to another.
 *
 * Limit: CueMol has no per-atom display flag, so the style of a hidden atom
 * is not kept -- an atom shown again comes back as a stick.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { objectNodes, rendererNodesOf } from '@renderer/worker/server/catalog/refs'
// Read-only helpers (op-catalog.md 3.1: reading a property or a paint state
// is not an operation of its own).
import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { getColoringClassName } from '@renderer/worker/server/services/coloring/colorTargets'
import { simplifySel } from '@renderer/worker/server/services/helpers/simplifySel'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import type { CmdContext, OpRun } from '@plugins/console/worker/dialect-api'
import { runOp as runConsoleOp } from '@plugins/console/worker/dialect-api'
import { emitFor, NONE } from './spec/emit'
import type { EmitContext } from './spec/emit'
import { parseSpec, SpecError } from './spec/parse'
import { isSelector, withSceneSelectors } from './spec/selectors'
import { selectionNames } from './names'
import { isMolecule, numberedObjects } from './models'
import type { NumberedObject } from './models'

/** The prefix of the console's own renderers. */
export const OWNED = 'chx:'

/** A renderer the console keeps on each molecule. */
interface OwnedKind {
  name: string
  type: string
  styles: string
  /** What it is limited to (the ribbon draws proteins, `nucl` nucleic acids). */
  scope?: string
}

/** The atom renderers, one per ChimeraX atom style. */
export const ATOM_STYLES = {
  stick: { name: 'chx:stick', type: 'ballstick', styles: 'StickBallStick,DefaultCPKColoring' },
  ball: { name: 'chx:ball', type: 'ballstick', styles: 'DefaultBallStick,DefaultCPKColoring' },
  sphere: { name: 'chx:sphere', type: 'cpk', styles: 'DefaultCPK,DefaultCPKColoring' },
} as const satisfies Record<string, OwnedKind>

export type AtomStyle = keyof typeof ATOM_STYLES

/** The ribbon renderers: the protein cartoon and its nucleic acid companion. */
export const CARTOONS: readonly OwnedKind[] = [
  { name: 'chx:cartoon', type: 'ribbon', styles: 'DefaultRibbon,DefaultHSCPaint', scope: 'protein' },
  { name: 'chx:nucl', type: 'nucl', styles: 'DefaultNucl', scope: 'nucleic' },
]

const ALL_KINDS: readonly OwnedKind[] = [...Object.values(ATOM_STYLES), ...CARTOONS]

/** Run a catalog op as part of this command (the console's `runOp`, tagged `chx`). */
export function runOp(ctx: WorkerContext, cc: CmdContext, name: string, args: Record<string, unknown>): Promise<OpRun> {
  return runConsoleOp(ctx, cc, 'chx', name, args)
}

/** One molecule and the CueMol expression a specification means in it. */
export interface Target {
  obj: NumberedObject
  sel: string
}

/** A failure to read a specification, with a caret under where. */
function specError(text: string, e: SpecError): string {
  return `${text}\n${' '.repeat(e.pos)}^ ${e.message}`
}

/** One atom, as `MolAtom` exposes it (read only). */
export interface AtomView {
  /** CueMol's atom id (`aid`). */
  id: number
  name: string
  element: string
  bfac: number
  occ: number
  chainName: string
  /** The residue number with its insertion code (`10`, `10A`). */
  residIndex: string
  residName: string
  pos: { x: number; y: number; z: number }
}

/** An atom iterator, as `AtomIterator` exposes it. */
interface AtomIter {
  target: unknown
  sel: unknown
  first(): void
  next(): void
  hasMore(): boolean
  get(): AtomView
}

/**
 * Visit the atoms `expr` matches in object `objUid`, in order; stop when
 * `visit` returns false. Read only (compiling a selection and walking its
 * atoms is no operation of its own).
 */
export function forEachAtom(ctx: WorkerContext, sceneId: number, objUid: number, expr: string, visit: (a: AtomView) => boolean | void): void {
  const mol = getSceneOrNull(ctx, sceneId)?.getObject(objUid)
  const sel = makeSel(ctx, expr, sceneId)
  const iter = ctx.svc.createObj('AtomIterator') as unknown as AtomIter | null
  if (!mol || !sel || !iter) return
  iter.target = mol
  iter.sel = sel
  for (iter.first(); iter.hasMore(); iter.next()) if (visit(iter.get()) === false) return
}

/**
 * The scene as the specification emitter sees it: the molecules (for a zone,
 * which reaches across models) and a way to read which atoms an expression
 * matches (for zones to whole chains or models). Reads only.
 */
export function emitContext(ctx: WorkerContext, sceneId: number): EmitContext {
  const mols = numberedObjects(ctx, sceneId).filter(isMolecule)
  /** Visit the atoms `expr` matches in model `model`; stop when `visit` says so. */
  const eachAtom = (model: number, expr: string, visit: (chain: string) => boolean): void => {
    const obj = mols.find((m) => m.model === model)
    if (obj) forEachAtom(ctx, sceneId, obj.uid, expr, (a) => visit(a.chainName))
  }
  return {
    models: mols.map((m) => ({ model: m.model, name: m.name })),
    namedSelections: selectionNames(ctx, sceneId),
    currentSelection(model) {
      const obj = mols.find((m) => m.model === model)
      if (!obj) return NONE
      const props = getGenericProps(ctx, { sceneId, nodeId: obj.uid, nodeType: 'object' })
      const sel = props.ok ? props.entries.find((e) => e.key === 'sel')?.value : undefined
      const text = sel === null || sel === undefined ? '' : String(sel).trim()
      return text === '' ? NONE : text
    },
    chainsHit(model, expr) {
      const chains = new Set<string>()
      eachAtom(model, expr, (c) => { chains.add(c); return true })
      return [...chains].sort()
    },
    anyHit(model, expr) {
      let hit = false
      eachAtom(model, expr, () => { hit = true; return false })
      return hit
    },
  }
}

/**
 * The molecules a specification reaches, each with what it means there.
 * An empty specification is every molecule, whole.
 */
export function targetsOf(ctx: WorkerContext, sceneId: number, spec: string): { ok: true; targets: Target[] } | { ok: false; error: string } {
  const mols = numberedObjects(ctx, sceneId).filter(isMolecule)
  if (spec.trim() === '') return { ok: true, targets: mols.map((obj) => ({ obj, sel: '*' })) }
  try {
    const ec = emitContext(ctx, sceneId)
    const read = withSceneSelectors(ec.namedSelections, () => parseSpec(spec, isSelector))
    if (!read) return { ok: false, error: `Error: "${spec}" is not an atom specification` }
    const targets: Target[] = []
    for (const obj of mols) {
      const sel = emitFor(read.node, obj.model, ec)
      if (sel !== NONE) targets.push({ obj, sel })
    }
    return { ok: true, targets }
  } catch (e) {
    if (e instanceof SpecError) return { ok: false, error: specError(spec, e) }
    throw e
  }
}

/** The console's renderers on a molecule, by name, with their uids. */
export function ownedOn(ctx: WorkerContext, sceneId: number, objId: number): Map<string, number> {
  const obj = objectNodes(ctx, sceneId).find((o) => o.id === objId)
  const out = new Map<string, number>()
  if (!obj) return out
  for (const n of rendererNodesOf(obj)) if (n.type === 'renderer' && n.name.startsWith(OWNED)) out.set(n.name, n.id)
  return out
}

/** A renderer's selection expression; '*' for one never set. */
export function readSel(ctx: WorkerContext, sceneId: number, rendId: number): string {
  const props = getGenericProps(ctx, { sceneId, nodeId: rendId, nodeType: 'renderer' })
  if (!props.ok) return NONE
  const v = props.entries.find((e) => e.key === 'sel')?.value
  const s = v === null || v === undefined ? '' : String(v).trim()
  return s === '' ? '*' : s
}

/**
 * The console's renderers on `obj`, made now if missing (drawing nothing),
 * with the styles of their kind.
 */
export async function ensureOwned(ctx: WorkerContext, cc: CmdContext, obj: NumberedObject): Promise<{ ok: true; ids: Map<string, number> } | { ok: false; error: string }> {
  const ids = ownedOn(ctx, cc.sceneId, obj.uid)
  for (const kind of ALL_KINDS) {
    if (ids.has(kind.name)) continue
    const made = await runOp(ctx, cc, 'create_renderer', {
      objId: obj.uid, rendererType: kind.type, name: kind.name, selection: NONE, centerView: false,
    })
    if (!made.ok) return made
    const id = ownedOn(ctx, cc.sceneId, obj.uid).get(kind.name)
    if (id === undefined) return { ok: false, error: `Error: could not make ${kind.name} on "${obj.name}"` }
    ids.set(kind.name, id)
    const styled = await runOp(ctx, cc, 'set_renderer_styles', { rendId: id, styles: kind.styles })
    if (!styled.ok) return styled
  }
  return { ok: true, ids }
}

/** `(a) or (b)`, simplified where one side is everything or nothing. */
export function union(a: string, b: string): string {
  if (a === '*' || b === '*') return '*'
  if (a === NONE) return b
  if (b === NONE) return a
  return `(${a}) or (${b})`
}

/** `(a) and not (b)`, simplified. */
export function minus(a: string, b: string): string {
  if (a === NONE || b === NONE) return a
  if (b === '*') return NONE
  return `(${a}) and not (${b})`
}

/** `(a) and (b)`, simplified. */
export function intersect(a: string, b: string): string {
  if (a === NONE || b === NONE) return NONE
  if (a === '*') return b
  if (b === '*') return a
  return `(${a}) and (${b})`
}

/**
 * Write a renderer's selection when it changes. `next` wraps the current
 * selection (union / minus / intersect), so it is simplified first: repeated
 * commands would otherwise nest it deeper every time.
 */
export async function writeSel(ctx: WorkerContext, cc: CmdContext, rendId: number, next: string): Promise<OpRun> {
  const selection = simplifySel(ctx, next, cc.sceneId)
  if (readSel(ctx, cc.sceneId, rendId) === selection) return { ok: true }
  return runOp(ctx, cc, 'set_renderer_selection', { rendId, selection })
}

/** The atom renderers' uids, by style. */
export function atomRenderers(ids: Map<string, number>): Record<AtomStyle, number> {
  return {
    stick: ids.get(ATOM_STYLES.stick.name) as number,
    ball: ids.get(ATOM_STYLES.ball.name) as number,
    sphere: ids.get(ATOM_STYLES.sphere.name) as number,
  }
}

/** The ribbon renderers' uids with their scopes. */
export function cartoonRenderers(ids: Map<string, number>): { id: number; scope: string }[] {
  return CARTOONS.map((k) => ({ id: ids.get(k.name) as number, scope: k.scope ?? '*' }))
}

/**
 * Make sure a renderer can take paint entries: switch it to a PaintColoring
 * only when it is not one yet, since switching starts a new table and would
 * drop the entries an earlier `color` put there.
 */
export async function ensurePaint(ctx: WorkerContext, cc: CmdContext, rendId: number): Promise<OpRun> {
  // The renderer's colouring class, not the GUI panel's `canPaint`: that is
  // also false while the molecule has no selection, and switching then
  // would wipe the table every time.
  const rend = getSceneOrNull(ctx, cc.sceneId)?.getRenderer(rendId)
  if (rend && getColoringClassName(rend as Parameters<typeof getColoringClassName>[0]) === 'PaintColoring') return { ok: true }
  return runOp(ctx, cc, 'set_renderer_coloring', { nodeId: rendId, nodeType: 'renderer', mode: 'paint-type-paint', styleName: null })
}
