/**
 * @file plugins/chimerax-console/worker/models.ts
 * @description ChimeraX model numbers (`#1`) for CueMol objects.
 *
 * ChimeraX numbers models in the order they are opened and does not reuse a
 * number when one is closed. The console keeps the same numbering in a
 * table per scene, in worker memory. The table is a naming aid, not scene
 * state: it is not saved with the scene and not undone with it.
 *
 * - An object seen for the first time -- opened in the GUI, brought back by
 *   undo, or in a scene opened again -- gets the next number, in scene order.
 * - An entry whose object is gone (closed, undone) is skipped, so a number
 *   never names an object that is not there.
 * - A scene saved and opened again is numbered afresh.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { listSceneObjects } from '@renderer/worker/server/services/scene/listSceneObjects'
import type { SceneObjectEntry } from '@renderer/worker/server/services/scene/listSceneObjects'

/** One object with its model number. */
export interface NumberedObject extends SceneObjectEntry {
  model: number
}

interface Table {
  byUid: Map<number, number>
  next: number
}

const tables = new Map<number, Table>()

/**
 * Every object in the scene with its model number, in model-number order.
 * Objects not numbered yet are numbered now.
 */
export function numberedObjects(ctx: WorkerContext, sceneId: number): NumberedObject[] {
  let table = tables.get(sceneId)
  if (!table) {
    table = { byUid: new Map(), next: 1 }
    tables.set(sceneId, table)
  }
  const objects = listSceneObjects(ctx, { sceneId }).objects
  const out: NumberedObject[] = []
  for (const o of objects) {
    let n = table.byUid.get(o.uid)
    if (n === undefined) {
      n = table.next++
      table.byUid.set(o.uid, n)
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
