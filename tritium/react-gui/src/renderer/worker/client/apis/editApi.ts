// Runs in renderer thread. Calls cross to worker via transport.invokeWorker.
import { WorkerTransport } from '../WorkerTransport';

export async function undo(
    transport: WorkerTransport, scene_id: number, depth = 0,
): Promise<boolean> {
    const result = await transport.invokeWorker('undo', { sceneId: scene_id, depth });
    return result?.[0]?.ok ?? false;
}

export async function redo(
    transport: WorkerTransport, scene_id: number, depth = 0,
): Promise<boolean> {
    const result = await transport.invokeWorker('redo', { sceneId: scene_id, depth });
    return result?.[0]?.ok ?? false;
}
