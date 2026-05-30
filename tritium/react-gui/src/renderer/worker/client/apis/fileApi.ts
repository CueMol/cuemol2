/**
 * @file renderer/worker/client/apis/fileApi.ts
 * @description Renderer-thread thin wrappers for worker file-I/O services
 * (renderer-compatibility probe, open-dialog filters, new scene+view,
 * scene / object load).
 *
 * Each function returns a Promise resolved with the worker reply and logs
 * a warning on failure.
 */
import { WorkerTransport } from '../WorkerTransport';
import type { ElectronFileFilter } from '../../../../shared/ipcTypes';
import type { FileOpenOptions } from '../../../components/fopen-opt-dlgs/types';
import type { GetCompatibleRendererNamesResult } from '../../server/services/getCompatibleRendererNames.service';
import type { GetMtzColumnInfoResult } from '../../server/services/getMtzColumnInfo.service';
import type { GetReaderDefaultOptionsResult } from '../../server/services/getReaderDefaultOptions.service';

const log = console;

/**
 * Ask the worker which renderer types are compatible with the contents of
 * `filePath`. Drives the "open file" renderer-picker dialog.
 *
 * @param transport - Worker transport.
 * @param filePath - Absolute file path the user selected.
 * @param readerName - Optional explicit reader to use instead of
 *   auto-detection.
 * @param contentFirst - Mirrors `loadObject`'s flag. Must match what
 *   the subsequent `loadObject()` call passes so the dialog's renderer
 *   list reflects the reader that will actually load the file.
 * @returns Object listing compatible renderer types and the detected
 *   object type; empty fields on failure.
 * @remarks Calls `getCompatibleRendererNames` worker service.
 */
export async function getCompatibleRendererNames(
    transport: WorkerTransport, filePath: string, readerName?: string,
    contentFirst = false,
): Promise<GetCompatibleRendererNamesResult> {
    try {
        return await transport.invokeService('getCompatibleRendererNames', {
            filePath, readerName, contentFirst,
        });
    } catch (e) {
        log.warn('getCompatibleRendererNames failed:', e);
        return { types: [], objType: '', readerName: '' };
    }
}

/**
 * Read an MTZ file's column labels + resolution range to populate the
 * file-open dialog's amplitude / phase / weight dropdowns.
 *
 * @param transport - Worker transport.
 * @param filePath - Absolute path of the MTZ file.
 * @returns Column list and resolution range; `ok:false` (empty) on failure.
 * @remarks Calls `getMtzColumnInfo` worker service.
 */
export async function getMtzColumnInfo(
    transport: WorkerTransport, filePath: string,
): Promise<GetMtzColumnInfoResult> {
    try {
        return await transport.invokeService('getMtzColumnInfo', { filePath });
    } catch (e) {
        log.warn('getMtzColumnInfo failed:', e);
        return { ok: false, columns: [], minRes: 0, maxRes: 0, resolution: 0 };
    }
}

/**
 * Read an ObjReader's option-property default values so the file-open dialog
 * can seed its format-specific option pane from the C++ reader instead of
 * hardcoding the defaults on the TS side.
 *
 * @param transport - Worker transport.
 * @param nickname - Resolved reader nickname (pdb / mmcif / ccp4map / ...).
 * @returns Reader-backed defaults keyed by reader property name; `ok:false`
 *   (empty) on failure.
 * @remarks Calls `getReaderDefaultOptions` worker service.
 */
export async function getReaderDefaultOptions(
    transport: WorkerTransport, nickname: string,
): Promise<GetReaderDefaultOptionsResult> {
    try {
        return await transport.invokeService('getReaderDefaultOptions', { nickname });
    } catch (e) {
        log.warn('getReaderDefaultOptions failed:', e);
        return { ok: false, values: {} };
    }
}

/**
 * Fetch the file-type filter list for an open-dialog category.
 *
 * @param transport - Worker transport.
 * @param catId - File-category id (see C++ `FileCatTypes`).
 * @returns `ElectronFileFilter[]` for the Electron dialog; empty on
 *   failure.
 * @remarks Calls `getOpenFilters` worker service.
 */
export async function getOpenFilters(
    transport: WorkerTransport, catId: number,
): Promise<ElectronFileFilter[]> {
    try {
        return await transport.invokeService('getOpenFilters', { catId });
    } catch (e) {
        log.warn('getOpenFilters failed:', e);
        return [];
    }
}

/**
 * Create a new scene plus default view on the worker side.
 *
 * @param transport - Worker transport.
 * @param dpr - Device pixel ratio for the new view.
 * @param name - Optional scene name; the worker proposes a unique one if
 *   omitted.
 * @param bindView - When `true`, immediately bind the new view; defaults
 *   to deferred binding so `MolViewPane` can call `bindCanvas` later.
 * @returns `{ scene_uid, view_uid, scene_name, view_name }`, or `null` on
 *   failure.
 * @remarks Calls `createNewSceneAndView` worker service.
 */
export async function createNewSceneAndView(
    transport: WorkerTransport, dpr: number, name?: string, bindView?: boolean,
): Promise<{ scene_uid: number; view_uid: number; scene_name: string; view_name: string } | null> {
    try {
        return await transport.invokeService('createNewSceneAndView', { dpr, name, bindView });
    } catch (e) {
        log.error('createNewSceneAndView failed:', e);
        return null;
    }
}

/**
 * Load a QSC scene file into an existing scene.
 *
 * @param transport - Worker transport.
 * @param filePath - Absolute path to the `.qsc` file.
 * @param scene_id - Target scene uid.
 * @returns `true` on success (also `true` when reply lacks `ok`).
 * @remarks Calls `loadScene` worker service.
 */
export async function loadScene(
    transport: WorkerTransport, filePath: string, scene_id: number,
): Promise<boolean> {
    log.info(`loading QSC scene: ${filePath}`);
    const result = await transport.invokeService('loadScene', { filePath, sceneId: scene_id });
    return result?.ok ?? true;
}

/**
 * Load an object (PDB / map / mesh / ...) into a scene.
 *
 * @param transport - Worker transport.
 * @param filePath - Absolute path to the file.
 * @param scene_id - Target scene uid.
 * @param options - File-type-specific open options collected from the
 *   user (renderer type, builder name, ...).
 * @param contentFirst - When true, the worker selects the reader purely
 *   from content sniffing (extension is ignored). When false (default),
 *   the extension narrows the candidate set first.
 * @param maxSniffBytes - Optional byte cap forwarded to
 *   LoadObjectCommand.max_sniff_bytes. 0 / undefined leaves the worker
 *   in unbounded mode (each reader scans its stream until it returns a
 *   verdict or hits EOF).
 * @returns `true` on success.
 * @remarks Calls `loadObject` worker service.
 */
export async function loadObject(
    transport: WorkerTransport, filePath: string, scene_id: number, options: FileOpenOptions,
    contentFirst = false, maxSniffBytes?: number,
): Promise<boolean> {
    log.info(`loading object file: ${filePath}`);
    const result = await transport.invokeService('loadObject', { filePath, sceneId: scene_id, options, contentFirst, maxSniffBytes });
    return result?.ok ?? true;
}
