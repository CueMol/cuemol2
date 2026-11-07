/**
 * @file plugins/chimerax-console/worker/models.ts
 * @description ChimeraX model numbers (`#1`) for CueMol objects.
 *
 * ChimeraX gives a new model the lowest number not in use (`Models.next_id`
 * in core/models.py), so the number of a closed model is reused by the next
 * one opened. The console keeps the same numbering in a table per scene, in
 * worker memory. The table is a naming aid, not scene state: it is not saved
 * with the scene and not undone with it.
 *
 * - An object seen for the first time -- opened in the GUI, brought back by
 *   undo, or in a scene opened again -- gets the lowest free number, in
 *   scene order.
 * - An entry whose object is gone (closed, undone) is dropped, which frees
 *   its number, so a number never names an object that is not there.
 * - A scene saved and opened again is numbered afresh.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { listSceneObjects } from '@renderer/worker/server/services/scene/listSceneObjects'
import type { SceneObjectEntry } from '@renderer/worker/server/services/scene/listSceneObjects'

/** One object with its model number. */
export interface NumberedObject extends SceneObjectEntry {
  model: number
}

const tables = new Map<number, Map<number, number>>()

/**
 * Every object in the scene with its model number, in model-number order.
 * Objects not numbered yet are numbered now.
 */
export function numberedObjects(ctx: WorkerContext, sceneId: number): NumberedObject[] {
  let byUid = tables.get(sceneId)
  if (!byUid) {
    byUid = new Map()
    tables.set(sceneId, byUid)
  }
  const objects = listSceneObjects(ctx, { sceneId }).objects
  // Drop the objects that are gone first, so their numbers are free again.
  const present = new Set(objects.map((o) => o.uid))
  for (const uid of byUid.keys()) if (!present.has(uid)) byUid.delete(uid)
  const used = new Set(byUid.values())
  let free = 1
  const out: NumberedObject[] = []
  for (const o of objects) {
    let n = byUid.get(o.uid)
    if (n === undefined) {
      while (used.has(free)) free++
      n = free
      used.add(n)
      byUid.set(o.uid, n)
    }
    out.push({ ...o, model: n })
  }
  return out.sort((a, b) => a.model - b.model)
}

/** Whether an object holds atoms (a MolCoord or one of its subclasses). */
export function isMolecule(o: SceneObjectEntry): boolean {
  return o.className === 'MolCoord' || o.className.endsWith('Mol')
}

/** Forget the tables (tests). */
export function resetModelNumbers(): void {
  tables.clear()
}
