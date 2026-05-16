/**
 * @file hooks/sceneContextMenu/runObjectSaveFlow.ts
 * @description Object "Save As" flow shared by the scene-tree context menu
 * (`dispatchSceneCtxAction` `saveAsObject`) and the File menu / Toolbar
 * `ObjectSaveAs` command.
 *
 * Mirrors UXP `Qm2Main.onSaveAsObj` (`fileopen.js`): enumerate compatible
 * writers, show a native save dialog, then write through the worker.
 */

import { IPC } from '../../../shared/ipcChannels'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'

/**
 * Run the full object save-as flow for a single object.
 *
 * @returns true when the object was written to a file, false on any
 *          early-out (no compatible writers, dialog cancelled, error).
 */
export async function runObjectSaveFlow(
    cm: AsyncCueMol,
    sceneId: number,
    objId: number,
): Promise<boolean> {
    let info
    try {
        info = await cm.invokeService('getObjectSaveInfo', { sceneId, objId })
    } catch (err) {
        console.warn('getObjectSaveInfo failed:', err)
        return false
    }
    if (!info?.ok || info.filters.length === 0) {
        console.info('saveAsObject: no compatible writers for this object')
        return false
    }
    const dlg = await window.electronAPI.invoke(IPC.DIALOG_OBJECT_SAVE, {
        defaultDir: info.defaultDir,
        defaultName: info.defaultFileName,
        filters: info.filters.map((f) => ({
            name: f.description,
            extensions: f.extensions,
        })),
        defaultFilterIndex: 0,
    })
    if (dlg.canceled || !dlg.filePath) return false
    const idx =
        dlg.filterIndex >= 0 && dlg.filterIndex < info.filters.length
            ? dlg.filterIndex
            : 0
    const writerName = info.filters[idx].name
    try {
        await cm.invokeService('saveObjectToFile', {
            sceneId,
            objId,
            path: dlg.filePath,
            writerName,
        })
        return true
    } catch (err) {
        console.warn('saveObjectToFile failed:', err)
        return false
    }
}
