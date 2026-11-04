/**
 * @file worker/client/apis/editApi.ts
 * @description Renderer-thread thin wrappers for worker undo / redo
 * services. Each call dispatches to the C++ `UndoManager` owned by the
 * scene.
 */
import { WorkerTransport } from '@renderer/worker/client/WorkerTransport';
import type { HistoryStepResult } from '@renderer/worker/server/services/undo/historyStep';

/**
 * Undo the last transaction on a scene.
 *
 * @param transport - Worker transport.
 * @param scene_id - Scene uid whose `UndoManager` is invoked.
 * @param depth - Number of additional transactions to undo (0 = one).
 * @returns how many were undone; `not-found` when there was nothing to undo,
 *   `native` (with the step that failed) when an undo failed.
 * @remarks Calls `undo` worker service.
 */
export async function undo(
    transport: WorkerTransport, scene_id: number, depth = 0,
): Promise<HistoryStepResult> {
    return transport.invokeService('undo', { sceneId: scene_id, depth });
}

/**
 * Redo the most recently undone transaction.
 *
 * @param transport - Worker transport.
 * @param scene_id - Scene uid whose `UndoManager` is invoked.
 * @param depth - Number of additional transactions to redo (0 = one).
 * @returns as `undo`.
 * @remarks Calls `redo` worker service.
 */
export async function redo(
    transport: WorkerTransport, scene_id: number, depth = 0,
): Promise<HistoryStepResult> {
    return transport.invokeService('redo', { sceneId: scene_id, depth });
}
