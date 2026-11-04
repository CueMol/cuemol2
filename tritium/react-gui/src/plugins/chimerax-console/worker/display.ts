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
import { getRendererPaintInfo } from '@renderer/worker/server/services/coloring/panelList'
import { simplifySel } from '@renderer/worker/server/services/helpers/simplifySel'
import type { CmdContext, OpRun } from '@plugins/console/worker/dialect-api'
import { runOp as runConsoleOp } from '@plugins/console/worker/dialect-api'
import { emitFor, NONE } from './spec/emit'
import { parseSpec, SpecError } from './spec/parse'
import { isSelector } from './spec/selectors'
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

/**
 * The molecules a specification reaches, each with what it means there.
 * An empty specification is every molecule, whole.
 */
export function targetsOf(ctx: WorkerContext, sceneId: number, spec: string): { ok: true; targets: Target[] } | { ok: false; error: string } {
  const mols = numberedObjects(ctx, sceneId).filter(isMolecule)
  if (spec.trim() === '') return { ok: true, targets: mols.map((obj) => ({ obj, sel: '*' })) }
  try {
    const read = parseSpec(spec, isSelector)
    if (!read) return { ok: false, error: `Error: "${spec}" is not an atom specification` }
    const targets: Target[] = []
    for (const obj of mols) {
      const sel = emitFor(read.node, obj.model)
      if (sel !== NONE) targets.push({ obj, sel })
    }
    return { ok: true, targets }
  } catch (e) {
    if (e instanceof SpecError) return { ok: false, error: specError(spec, e) }
    throw e
  }
}

/** The console's renderers on a molecule, by name, with their uids. */
function ownedOn(ctx: WorkerContext, sceneId: number, objId: number): Map<string, number> {
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
  if (getRendererPaintInfo(ctx, { sceneId: cc.sceneId, rendId }).canPaint) return { ok: true }
  return runOp(ctx, cc, 'set_renderer_coloring', { nodeId: rendId, nodeType: 'renderer', mode: 'paint-type-paint', styleName: null })
}
