/**
 * @file commands/useFileCommands.ts
 * @description Registers File-menu commands not covered by the scene-save
 * path in `useEditCommands`:
 *   - ObjectSaveAs     -- save a scene object to a file (UXP `onFileSaveAs`)
 *   - SaveCurrentView  -- save the live view's camera to a .cam file
 *                        (UXP `onSaveCurView`)
 *   - SceneReload      -- reload the current scene from its source file
 *                        (UXP `onReloadScene`)
 *   - ExportPng/Umbreon/Pov/Stl/Mqo -- export the scene via a chosen exporter
 *                        (one command per file type; UXP `exportScene`)
 *
 * The underlying worker services already exist; this hook only wires the
 * command layer (dialog flow + service invocation).
 */

import { IPC } from '../../shared/ipcChannels'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from './commandTypes'
import { useShowErrorAlert } from '../components/dialogs/ErrorAlertDialogProvider'
import { useShowObjectPicker } from '../components/dialogs/ObjectPickerDialogProvider'
import { useShowConfirmReloadSceneDialog } from '../components/dialogs/ConfirmReloadSceneDialogProvider'
import { useShowExportPngOptionsDialog } from '../components/dialogs/ExportPngOptionsDialogProvider'
import { runObjectSaveFlow } from '../hooks/sceneContextMenu/runObjectSaveFlow'
import { runSceneExportFlow } from '../hooks/sceneContextMenu/runSceneExportFlow'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'

interface UseFileCommandsOptions {
    cm: AsyncCueMol | null
    getActiveSceneInfo: ActiveSceneCommandDeps
}

export function useFileCommands({
    cm,
    getActiveSceneInfo,
}: UseFileCommandsOptions): void {

    const showErrorAlert = useShowErrorAlert()
    const showObjectPicker = useShowObjectPicker()
    const showConfirmReload = useShowConfirmReloadSceneDialog()
    const showExportPngOptions = useShowExportPngOptionsDialog()

    // ObjectSaveAs -- UXP `onFileSaveAs`. The File menu has no right-clicked
    // node, so the object to save is resolved from the active scene: save
    // directly when there is exactly one, otherwise show a picker. Objects
    // without a compatible writer are excluded, as UXP does.
    useRegisterCommand(CmdId.ObjectSaveAs, async () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        const res = await cm.invokeService('listSavableObjects', {
            sceneId: info.scene_uid,
        })
        const objects = res?.ok ? res.objects : []
        if (objects.length === 0) {
            await showErrorAlert({
                title: 'Save File As',
                message: 'No object to save',
            })
            return
        }
        let objId: number
        if (objects.length === 1) {
            objId = objects[0].id
        } else {
            const picked = await showObjectPicker({
                // UXP labels its prompt rows "<name> (<type>, id=<ID>)".
                objects: objects.map((o) => ({
                    id: o.id,
                    name: `${o.name} (${o.className}, id=${o.id})`,
                })),
            })
            if (picked === null) return
            objId = picked
        }
        const flow = await runObjectSaveFlow(cm, info.scene_uid, objId)
        if (flow.status === 'error') {
            await showErrorAlert({
                title: 'Save File As',
                message: `Failed to save file: ${flow.path}`,
            })
        }
    })

    // SaveCurrentView -- UXP `onSaveCurView`: store the live view in the
    // transient '__current' camera, then write that camera to a file.
    useRegisterCommand(CmdId.SaveCurrentView, async () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        const saved = await cm.invokeService('saveViewToCamera', {
            sceneId: info.scene_uid,
            viewId: info.view_id,
            name: '__current',
            withVisFlags: false,
        })
        if (!saved?.ok) {
            console.warn('Save current view: saveViewToCamera failed')
            return
        }
        const dlg = await window.electronAPI.invoke(IPC.DIALOG_CAMERA_SAVE, {
            defaultName: 'view',
        })
        if (dlg.canceled || !dlg.filePath) return
        await cm.invokeService('saveCameraToFile', {
            sceneId: info.scene_uid,
            name: '__current',
            path: dlg.filePath,
        })
    })

    // Export scene -- one command per file type (UXP `exportScene`). Each
    // resolves the active scene/view and runs the shared export flow with a
    // fixed exporter name; image-type exporters (png/umbreon) reuse the image
    // options dialog. Routed from the Rendering > Export scene submenu.
    const makeExportHandler = (exporterName: string) => async () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        await runSceneExportFlow(
            cm, info.scene_uid, info.view_id, exporterName, showExportPngOptions,
        )
    }
    useRegisterCommand(CmdId.ExportPng, makeExportHandler('png'))
    useRegisterCommand(CmdId.ExportUmbreon, makeExportHandler('umbreon'))
    useRegisterCommand(CmdId.ExportPov, makeExportHandler('pov'))
    useRegisterCommand(CmdId.ExportStl, makeExportHandler('stl'))
    useRegisterCommand(CmdId.ExportMqo, makeExportHandler('mqo'))

    // SceneReload -- UXP `onReloadScene`: re-read the scene from its source
    // file, confirming first when there are unsaved changes.
    useRegisterCommand(CmdId.SceneReload, async () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        const saveInfo = await cm.invokeService('getSceneSaveInfo', {
            sceneId: info.scene_uid,
        })
        const src = saveInfo?.src ?? ''
        if (!src) {
            console.info('Reload Scene: scene has no source file')
            return
        }
        const closeInfo = await cm.invokeService('getSceneCloseInfo', { viewId: info.view_id })
        if (closeInfo?.ok && closeInfo.modified) {
            const proceed = await showConfirmReload({ sceneName: closeInfo.sceneName })
            if (!proceed) return
        }
        await cm.invokeService('loadScene', { filePath: src, sceneId: info.scene_uid })
    })
}
