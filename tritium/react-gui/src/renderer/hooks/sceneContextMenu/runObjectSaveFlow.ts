/**
 * @file hooks/sceneContextMenu/runObjectSaveFlow.ts
 * @description Object "Save As" flow shared by the scene-tree context menu
 * (`dispatchSceneCtxAction` `saveAsObject`) and the File menu / Toolbar
 * `ObjectSaveAs` command.
 *
 * Mirrors UXP `Qm2Main.onSaveAsObj` (`fileopen.js`): enumerate compatible
 * writers, show a native save dialog, then write through the worker.
 *
 * The last-used writer is persisted in `UiState.saveWriterName` (UXP pref
 * `cuemol2.ui.histories.save_writer_name`). Electron's save dialog has no
 * filter-preselect option, so the worker moves that writer to the head of the
 * filter list instead.
 */

import { IPC } from '../../../shared/ipcChannels'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'

/** UXP default for the `save_writer_name` pref. */
const DEFAULT_WRITER = 'pdb'

/**
 * Outcome of the save flow. `error` carries the path so the caller can show
 * the UXP alert text ("Failed to save file: <path>"); the caller owns the
 * alert because this is a plain function, not a hook.
 */
export type ObjectSaveFlowResult =
    | { status: 'saved'; path: string }
    | { status: 'cancelled' }
    | { status: 'no-writer' }
    | { status: 'error'; path: string }

/**
 * Run the full object save-as flow for a single object.
 *
 * @param cm - worker client
 * @param sceneId - scene owning the object
 * @param objId - object to write
 * @returns the flow outcome; callers show an error alert on `'error'`.
 */
export async function runObjectSaveFlow(
    cm: AsyncCueMol,
    sceneId: number,
    objId: number,
): Promise<ObjectSaveFlowResult> {
    let preferredWriter = DEFAULT_WRITER
    try {
        const ui = await window.electronAPI.invoke(IPC.UI_LOAD)
        if (ui?.saveWriterName) preferredWriter = ui.saveWriterName
    } catch {
        /* fall back to the UXP default */
    }

    let info
    try {
        info = await cm.invokeService('getObjectSaveInfo', {
            sceneId,
            objId,
            preferredWriter,
        })
    } catch (err) {
        console.warn('getObjectSaveInfo failed:', err)
        return { status: 'no-writer' }
    }
    if (!info?.ok || info.filters.length === 0) {
        console.info('saveAsObject: no compatible writers for this object')
        return { status: 'no-writer' }
    }
    const dlg = await window.electronAPI.invoke(IPC.DIALOG_OBJECT_SAVE, {
        defaultDir: info.defaultDir,
        defaultName: info.defaultFileName,
        filters: info.filters.map((f) => ({
            name: f.description,
            extensions: f.extensions,
        })),
        // filters[0] is the remembered writer, so this fallback (used when the
        // typed extension matches no filter row) resolves to it.
        defaultFilterIndex: 0,
    })
    if (dlg.canceled || !dlg.filePath) return { status: 'cancelled' }
    const idx =
        dlg.filterIndex >= 0 && dlg.filterIndex < info.filters.length
            ? dlg.filterIndex
            : 0
    const writerName = info.filters[idx].name
    try {
        const res = await cm.invokeService('saveObjectToFile', {
            sceneId,
            objId,
            path: dlg.filePath,
            writerName,
        })
        if (res?.ok !== true) {
            console.warn('saveObjectToFile reported failure:', dlg.filePath)
            return { status: 'error', path: dlg.filePath }
        }
    } catch (err) {
        console.warn('saveObjectToFile failed:', err)
        return { status: 'error', path: dlg.filePath }
    }
    try {
        await window.electronAPI.invoke(IPC.UI_SAVE, { saveWriterName: writerName })
    } catch {
        /* remembering the writer is best-effort */
    }
    return { status: 'saved', path: dlg.filePath }
}
