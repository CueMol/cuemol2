/**
 * @file commands/useFileCommands.ts
 * @description Registers File-menu commands not covered by the scene-save
 * path in `useEditCommands`:
 *   - ObjectSaveAs     — save a scene object to a file (UXP `onFileSaveAs`)
 *   - SaveCurrentView  — save the live view's camera to a .cam file
 *                        (UXP `onSaveCurView`)
 *   - SceneReload      — reload the current scene from its source file
 *                        (UXP `onReloadScene`)
 *   - ExportImage      — render the scene to a PNG, collecting resolution /
 *                        size / transparency first (UXP `exportpng-opt-dlg`)
 *
 * The underlying worker services already exist; this hook only wires the
 * command layer (dialog flow + service invocation).
 */

import { IPC } from '../../shared/ipcChannels'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from './commandTypes'
import { useShowObjectPicker } from '../components/dialogs/ObjectPickerDialogProvider'
import { useShowConfirmReloadSceneDialog } from '../components/dialogs/ConfirmReloadSceneDialogProvider'
import { useShowExportPngOptionsDialog } from '../components/dialogs/ExportPngOptionsDialogProvider'
import { runObjectSaveFlow } from '../hooks/sceneContextMenu/runObjectSaveFlow'
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

    const showObjectPicker = useShowObjectPicker()
    const showConfirmReload = useShowConfirmReloadSceneDialog()
    const showExportPngOptions = useShowExportPngOptionsDialog()

    // ObjectSaveAs — UXP `onFileSaveAs`. The File menu has no right-clicked
    // node, so the object to save is resolved from the active scene: save
    // directly when there is exactly one, otherwise show a picker.
    useRegisterCommand(CmdId.ObjectSaveAs, async () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        const res = await cm.invokeService('getSceneTree', { sceneId: info.scene_uid })
        const objects = (res?.tree?.children ?? [])
            .filter((n) => n.type === 'object')
            .map((n) => ({ id: n.id, name: n.name }))
        if (objects.length === 0) {
            console.info('Save File As: scene has no objects to save')
            return
        }
        let objId: number
        if (objects.length === 1) {
            objId = objects[0].id
        } else {
            const picked = await showObjectPicker({ objects })
            if (picked === null) return
            objId = picked
        }
        await runObjectSaveFlow(cm, info.scene_uid, objId)
    })

    // SaveCurrentView — UXP `onSaveCurView`: store the live view in the
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

    // ExportImage — render the active scene off-screen to a PNG file (UXP
    // `Export scene`). The C++ ImgSceneExporter renders through the WebGL FBO
    // (gfx::RenderTarget) and reads the pixels back.
    useRegisterCommand(CmdId.ExportImage, async () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        // Mirror UXP `exportScene`: default the file name to the scene name and
        // seed the PNG options with the live view size.
        const imgInfo = await cm.invokeService('getExportImageInfo', {
            sceneId: info.scene_uid,
            viewId: info.view_id,
        })
        const baseName = (imgInfo?.sceneName ?? '').trim() || 'scene'
        const viewW = imgInfo && imgInfo.width > 0 ? imgInfo.width : 1024
        const viewH = imgInfo && imgInfo.height > 0 ? imgInfo.height : 768
        // 1) choose the file (default name = scene name).
        const dlg = await window.electronAPI.invoke(IPC.DIALOG_IMAGE_SAVE, {
            defaultName: `${baseName}.png`,
        })
        if (dlg.canceled || !dlg.filePath) return
        // 2) collect PNG options seeded with the live view size.
        const opts = await showExportPngOptions({
            initialWidth: viewW,
            initialHeight: viewH,
        })
        if (!opts) return
        // 3) render off-screen to the chosen file.
        await cm.invokeService('exportImage', {
            sceneId: info.scene_uid,
            viewId: info.view_id,
            filePath: dlg.filePath,
            width: opts.width,
            height: opts.height,
            alpha: opts.alpha,
            resoln: opts.dpi,
            depth: false,
        })
    })

    // SceneReload — UXP `onReloadScene`: re-read the scene from its source
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
        const closeInfo = await cm.getSceneCloseInfo(info.view_id)
        if (closeInfo?.ok && closeInfo.modified) {
            const proceed = await showConfirmReload({ sceneName: closeInfo.sceneName })
            if (!proceed) return
        }
        await cm.invokeService('loadScene', { filePath: src, sceneId: info.scene_uid })
    })
}
