/**
 * @file worker/server/services/select/focusMolSelection.ts
 * @description Move the camera to the atoms a selection matches in one
 * MolCoord object, without changing the object's selection.
 *
 * The body of the `focus_selection` op, and the view half of the MolStruct
 * pane's Center / Zoom buttons (which set the selection first, as
 * `set_mol_selection`). A null selection is the object's current one, read
 * as it is rather than compiled again from its text.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'
import { setViewXform } from '@renderer/worker/server/services/view/viewXform'
import { recordOp } from '@renderer/worker/server/actions/serviceOps'
import { fail, ok } from '@renderer/worker/shared/result'
import type { Result } from '@renderer/worker/shared/result'

export interface FocusMolSelectionArgs {
  sceneId: number
  viewId: number
  molId: number
  /** Selection expression; null uses the object's current selection. */
  selStr: string | null
  /** True fits the zoom and slab too; false only moves the centre. */
  zoom: boolean
}

export type FocusMolSelectionResult = Result<Record<never, never>>

interface XYZ {
  x: number
  y: number
  z: number
}

/** The MolCoord members that frame the view on a selection. */
interface FramingMol {
  sel: unknown
  getAtomSelSize(sel: unknown): number
  fitView2(view: unknown, sel: unknown): void
  orientView(view: unknown, sel: unknown): void
}

/** An atom iterator, as `AtomIterator` exposes it. */
interface AtomIter {
  target: unknown
  sel: unknown
  first(): void
  next(): void
  hasMore(): boolean
  get(): { pos: XYZ }
}

/** The object, view and selection a framing call works on. */
export interface FramingTarget {
  mol: FramingMol
  view: unknown
  sel: unknown
}

/**
 * Resolve the object, view and selection to frame, after checking the
 * selection matches some atoms.
 *
 * @param selStr - an expression, or null for the object's current selection
 * @returns the target, or why there is nothing to frame
 */
export function framingTarget(
  ctx: WorkerContext,
  sceneId: number,
  viewId: number,
  objId: number,
  selStr: string | null,
): FramingTarget | { error: string } {
  const mol = getSceneOrNull(ctx, sceneId)?.getObject(objId) as unknown as FramingMol | null
  if (!mol || typeof mol.fitView2 !== 'function') return { error: 'No object with that id in this scene.' }
  const view = ctx.sceMgr.getView(viewId)
  if (!view) return { error: 'The view could not be read.' }
  let sel: unknown
  if (selStr === null) {
    // An object without a selection holds an empty one, which C++ iterates
    // as every atom: treat it as no selection rather than frame them all.
    sel = mol.sel
    const text = (sel as { toString(): string } | null)?.toString() ?? ''
    if (text === '') return { error: 'The object has no current selection.' }
  } else {
    sel = makeSel(ctx, selStr, sceneId)
    if (!sel || selStr.trim() === '') return { error: 'The selection did not compile.' }
  }
  let count: number
  try {
    count = mol.getAtomSelSize(sel)
  } catch {
    return { error: 'The selection did not compile.' }
  }
  if (count === 0) return { error: 'The selection matches no atoms.' }
  return { mol, view, sel }
}

/** The mean position of the atoms `sel` matches in `mol`, or null when none. */
function selectionCentroid(ctx: WorkerContext, mol: unknown, sel: unknown): XYZ | null {
  const iter = ctx.svc.createObj('AtomIterator') as unknown as AtomIter | null
  if (!iter) return null
  iter.target = mol
  iter.sel = sel
  let n = 0
  const sum = { x: 0, y: 0, z: 0 }
  for (iter.first(); iter.hasMore(); iter.next()) {
    const p = iter.get().pos
    sum.x += p.x
    sum.y += p.y
    sum.z += p.z
    n += 1
  }
  return n === 0 ? null : { x: sum.x / n, y: sum.y / n, z: sum.z / n }
}

/**
 * Fit the view to (or centre it on) a selection of one MolCoord object.
 * Recorded as `focus_selection` when an undo transaction is open (the
 * MolStruct pane's buttons), like any view op on the same step.
 */
export function focusMolSelection(ctx: WorkerContext, args: FocusMolSelectionArgs): FocusMolSelectionResult {
  const t = framingTarget(ctx, args.sceneId, args.viewId, args.molId, args.selStr)
  if ('error' in t) return fail(t.error, 'invalid-args')
  if (args.zoom) {
    t.mol.fitView2(t.view, t.sel)
  } else {
    const c = selectionCentroid(ctx, t.mol, t.sel)
    if (!c) return fail('The selection matches no atoms.', 'invalid-args')
    if (!setViewXform(ctx, { viewId: args.viewId, center: c }).ok) return fail('The view could not be changed.', 'native')
  }
  recordOp(ctx, args.sceneId, 'focus_selection', { objId: args.molId, selection: args.selStr, zoom: args.zoom }, ['objId'])
  return ok()
}
