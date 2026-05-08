// Runs in renderer thread. Calls cross to worker via transport.invokeService.
import { WorkerTransport } from '../WorkerTransport';

export async function undo(
    transport: WorkerTransport, scene_id: number, depth = 0,
): Promise<boolean> {
    const result = await transport.invokeService('undo', { sceneId: scene_id, depth });
    return result?.ok ?? false;
}

export async function redo(
    transport: WorkerTransport, scene_id: number, depth = 0,
): Promise<boolean> {
    const result = await transport.invokeService('redo', { sceneId: scene_id, depth });
    return result?.ok ?? false;
}
