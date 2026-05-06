// Runs in renderer thread. Calls cross to worker via transport.invokeWorker.
import { WorkerTransport } from '../WorkerTransport';
import type { ElectronFileFilter } from '../../../../shared/ipcTypes';
import type { FileOpenOptions } from '../../../components/fopen-opt-dlgs/types';

const log = console;

export async function getCompatibleRendererNames(
    transport: WorkerTransport, filePath: string,
): Promise<string[]> {
    try {
        const result = await transport.invokeWorker('getCompatibleRendererNames', { filePath });
        return result?.[0] ?? [];
    } catch (e) {
        log.warn('getCompatibleRendererNames failed:', e);
        return [];
    }
}

export async function getOpenFilters(
    transport: WorkerTransport, catId: number,
): Promise<ElectronFileFilter[]> {
    try {
        const result = await transport.invokeWorker('getOpenFilters', { catId });
        return result?.[0] ?? [];
    } catch (e) {
        log.warn('getOpenFilters failed:', e);
        return [];
    }
}

export async function createNewSceneAndView(
    transport: WorkerTransport, dpr: number, name?: string,
): Promise<{ scene_uid: number; view_uid: number } | null> {
    try {
        const result = await transport.invokeWorker('createNewSceneAndView', { dpr, name });
        return result?.[0] ?? null;
    } catch (e) {
        log.error('createNewSceneAndView failed:', e);
        return null;
    }
}

export async function loadScene(
    transport: WorkerTransport, filePath: string, scene_id: number,
): Promise<boolean> {
    log.info(`loading QSC scene: ${filePath}`);
    const result = await transport.invokeWorker('loadScene', { filePath, sceneId: scene_id });
    return result?.[0]?.ok ?? true;
}

export async function loadObject(
    transport: WorkerTransport, filePath: string, scene_id: number, options: FileOpenOptions,
): Promise<boolean> {
    log.info(`loading object file: ${filePath}`);
    const result = await transport.invokeWorker('loadObject', { filePath, sceneId: scene_id, options });
    return result?.[0]?.ok ?? true;
}
