/**
 * @file renderer/__test__/undoStepHistory.test.ts
 * @description What the undo service tells the user when a step fails part
 * way through a multi-step undo.
 *
 * C++ discards the whole history when a step fails (the scene may be partly
 * changed) and `Scene.undo` answers only true / false. Stepping one at a time
 * is what lets the message name the step that failed and the steps before it
 * that did go through -- not "nothing to undo", and not "the scene is as it
 * was".
 */

import { describe, it, expect, vi } from 'vitest'

const { synced } = vi.hoisted(() => ({ synced: vi.fn() }))
vi.mock('@renderer/worker/server/actions/actionLog', () => ({ syncActionRows: synced }))

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { undo } from '@renderer/worker/server/services/undo/undo'

/** A scene whose undo stack holds `descs` (newest first); the step named `failing` fails and clears it. */
function sceneWith(descs: string[], failing: string) {
  const undoStack = [...descs]
  const redoStack: string[] = []
  return {
    getUndoSize: () => undoStack.length,
    getUndoDesc: (i: number) => undoStack[i],
    getRedoSize: () => redoStack.length,
    getRedoDesc: (i: number) => redoStack[i],
    undo: () => {
      if (undoStack[0] === failing) {
        undoStack.length = 0
        redoStack.length = 0
        return false
      }
      redoStack.unshift(undoStack.shift() as string)
      return true
    },
  }
}

describe('undo service', () => {
  it('names the step that failed and the steps undone before it', () => {
    const scene = sceneWith(['Paint', 'Delete atoms', 'Load'], 'Delete atoms')
    const ctx = { sceMgr: { getScene: () => scene } } as unknown as WorkerContext

    const res = undo(ctx, { sceneId: 1, depth: 2 })

    expect(res).toEqual({
      ok: false,
      code: 'native',
      error: 'Undid 1 step; undo of "Delete atoms" failed, so the undo history was cleared. The scene may be partly changed.',
    })
    // The rows follow the stack even when it failed.
    expect(synced).toHaveBeenCalledWith(scene, 1)
  })

  it('says there was nothing to undo only when there was nothing', () => {
    const scene = sceneWith([], '')
    const ctx = { sceMgr: { getScene: () => scene } } as unknown as WorkerContext
    expect(undo(ctx, { sceneId: 1 })).toEqual({ ok: false, code: 'not-found', error: 'nothing to undo' })
  })
})
