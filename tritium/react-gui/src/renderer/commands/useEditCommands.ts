/**
 * @file commands/useEditCommands.ts
 * @description Registers edit-layer commands (save, save-as) targeting the
 * active scene. Undo / Redo are owned by `hooks/useUndoRedoState.ts`, which
 * also tracks their availability and the history dropdown.
 *
 * Save / Save As mirror UXP `Qm2Main.onSaveScene` / `onSaveSceneAs`
 * (uxp_gui/cuemol2/base/content/fileopen.js:518-642). The Save command
 * falls through to the Save As dialog when the scene has no associated
 * file or its source path no longer exists on disk.
 */

import { useCallback } from 'react'
import { IPC } from '../../shared/ipcChannels'
import type { SaveSceneOptions } from '../worker/server/services/saveScene.service'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from './commandTypes'
import { useShowQscWriterOptionDialog } from '../components/dialogs/QscWriterOptionDialogProvider'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { addRecent } from './addRecent'

interface UseEditCommandsOptions {
    cm: AsyncCueMol | null
    getActiveSceneInfo: ActiveSceneCommandDeps
}

export function useEditCommands({
    cm,
    getActiveSceneInfo,
}: UseEditCommandsOptions): void {

    const showQscWriterOptionDialog = useShowQscWriterOptionDialog()

    const runWrite = useCallback(
        async (filePath: string, options: SaveSceneOptions | undefined): Promise<boolean> => {
            if (!cm) return false
            const info = getActiveSceneInfo()
            if (!info) return false
            // UXP parity (qsc_io.backupSceneFile): rename the existing file
            // to "<path>.bak" before overwrite. Best-effort — log and proceed
            // if backup fails (UXP also continues with a putLogMsg warning).
            const bk = await window.electronAPI.invoke(IPC.FILE_BACKUP_RENAME, { path: filePath })
            if (!bk.ok && bk.error) {
                console.warn('Cannot create backup file:', bk.error)
            }
            const res = await cm.invokeService('saveScene', {
                sceneId: info.scene_uid,
                viewId: info.view_id,
                filePath,
                options,
            })
            const ok = !!res?.ok
            if (ok) addRecent(filePath, 'scene')
            return ok
        },
        [cm, getActiveSceneInfo],
    )

    const runSaveAs = useCallback(async (): Promise<boolean> => {
        if (!cm) return false
        const info = getActiveSceneInfo()
        if (!info) return false
        const sceneInfo = await cm.invokeService('getSceneSaveInfo', { sceneId: info.scene_uid })
        const baseName = sceneInfo?.name || 'scene'
        const defaultName = baseName.toLowerCase().endsWith('.qsc') ? baseName : `${baseName}.qsc`
        const dlg = await window.electronAPI.invoke(IPC.DIALOG_SAVE_SCENE, { defaultName })
        if (dlg.canceled || !dlg.filePath) return false
        const filePath = dlg.filePath.toLowerCase().endsWith('.qsc')
            ? dlg.filePath
            : `${dlg.filePath}.qsc`
        // UXP parity: option dialog runs after Save dialog, before write.
        const opts = await showQscWriterOptionDialog()
        if (opts === null) return false
        return runWrite(filePath, opts)
    }, [cm, getActiveSceneInfo, showQscWriterOptionDialog, runWrite])

    useRegisterCommand(CmdId.FileSave, async () => {
        if (!cm) return false
        const info = getActiveSceneInfo()
        if (!info) return false
        const sceneInfo = await cm.invokeService('getSceneSaveInfo', { sceneId: info.scene_uid })
        const src = sceneInfo?.src ?? ''
        if (!src) {
            return runSaveAs()
        }
        const fileExists = await window.electronAPI.invoke(IPC.FILE_EXISTS, { path: src })
        if (!fileExists.exists) {
            // UXP parity: util.isFile defence — fall through to Save As if
            // the previously associated file has disappeared.
            return runSaveAs()
        }
        // UXP `onSaveScene` writes with the writer's current default opts —
        // no option dialog on the plain Save path.
        return runWrite(src, undefined)
    })

    useRegisterCommand(CmdId.FileSaveAs, async () => {
        return runSaveAs()
    })
}
