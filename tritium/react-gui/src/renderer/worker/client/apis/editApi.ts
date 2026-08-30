/**
 * @file renderer/worker/client/apis/editApi.ts
 * @description Renderer-thread thin wrappers for worker undo / redo
 * services. Each call dispatches to the C++ `UndoManager` owned by the
 * scene.
 */
import { WorkerTransport } from '@renderer/worker/client/WorkerTransport';

/**
 * Undo the last transaction on a scene.
 *
 * @param transport - Worker transport.
 * @param scene_id - Scene uid whose `UndoManager` is invoked.
 * @param depth - Number of additional transactions to undo (0 = one).
 * @returns `true` if at least one transaction was undone.
 * @remarks Calls `undo` worker service.
 */
export async function undo(
    transport: WorkerTransport, scene_id: number, depth = 0,
): Promise<boolean> {
    const result = await transport.invokeService('undo', { sceneId: scene_id, depth });
    return result?.ok ?? false;
}

/**
 * Redo the most recently undone transaction.
 *
 * @param transport - Worker transport.
 * @param scene_id - Scene uid whose `UndoManager` is invoked.
 * @param depth - Number of additional transactions to redo (0 = one).
 * @returns `true` if at least one transaction was redone.
 * @remarks Calls `redo` worker service.
 */
export async function redo(
    transport: WorkerTransport, scene_id: number, depth = 0,
): Promise<boolean> {
    const result = await transport.invokeService('redo', { sceneId: scene_id, depth });
    return result?.ok ?? false;
}
