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

import { IPC } from '@shared/ipcChannels'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from './commandTypes'
import { useShowErrorAlert } from '@renderer/dialogs/ErrorAlertDialogProvider'
import { useShowObjectPicker } from '@renderer/dialogs/ObjectPickerDialogProvider'
import { useShowConfirmReloadSceneDialog } from '@renderer/dialogs/ConfirmReloadSceneDialogProvider'
import { useShowExportPngOptionsDialog } from '@renderer/dialogs/ExportPngOptionsDialogProvider'
import { runObjectSaveFlow } from '@renderer/hooks/sceneContextMenu/runObjectSaveFlow'
import { runSceneExportFlow } from '@renderer/hooks/sceneContextMenu/runSceneExportFlow'
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

    // ObjectSaveAs -- UXP `onFileSaveAs`. The scene tree right-clicks a
    // specific object and passes its id; the File menu has none, so the
    // object is resolved from the active scene: save directly when there is
    // exactly one, otherwise show a picker. Objects without a compatible
    // writer are excluded, as UXP does.
    //
    // One handler for both entry points: the scene tree used to run its own
    // copy of this flow, which reported the same failure under a different
    // title and skipped the "no object to save" case.
    useRegisterCommand(CmdId.ObjectSaveAs, async (args) => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return

        let objId = args?.objId
        if (objId === undefined) {
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

    // Open Recent > Clear. A command rather than a direct IPC call from the
    // menu dispatcher, so the MRU can be cleared from anywhere.
    useRegisterCommand(CmdId.RecentClear, () => {
        window.electronAPI.invoke(IPC.RECENT_CLEAR).catch((e: unknown) =>
            console.error('recent.clear:', e),
        )
    })

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
        const loaded = await cm.invokeService('loadScene', { filePath: src, sceneId: info.scene_uid })
        if (!loaded.ok) {
            await showErrorAlert({
                title: 'Reload Scene failed',
                message: `Failed to reload:\n${src}\n\n${loaded.error}`,
            })
        }
    })
}
