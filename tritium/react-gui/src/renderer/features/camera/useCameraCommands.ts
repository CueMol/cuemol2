/**
 * @file features/camera/useCameraCommands.ts
 * @description Handlers for every camera command, wherever it is raised from
 * (the Camera pane's toolbar, keys, and context menu).
 *
 * Cameras are addressed by name: a registered camera has no uid (ADR-0005).
 * Anything that reads or writes the live viewpoint needs the active molview,
 * so those handlers are no-ops without one. Registered app-wide rather than
 * from the scene-tree provider, because the Camera pane is their surface now.
 */

import { IPC } from '@shared/ipcChannels'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from '@renderer/commands/commandTypes'
import { useShowEditCameraVisFlagsDialog } from '@renderer/dialogs/EditCameraVisFlagsDialogProvider'
import { useShowTextPromptDialog } from '@renderer/dialogs/TextPromptDialogProvider'
import { useRegisterCommand } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import * as ops from './cameraOps'

export interface CameraCommandsOptions {
  cm: AsyncCueMol | null
  getActiveSceneInfo: ActiveSceneCommandDeps
}

export function useCameraCommands({ cm, getActiveSceneInfo }: CameraCommandsOptions): void {
  const showEditCameraVisFlags = useShowEditCameraVisFlagsDialog()
  const showTextPrompt = useShowTextPromptDialog()

  // Mirrors UXP `ws.createCamera`: suggest the first free `camera_N`, prompt,
  // and save the view under whatever the user typed -- an existing name is
  // overwritten by the worker rather than refused.
  useRegisterCommand(CmdId.CameraNew, async () => {
    const info = getActiveSceneInfo()
    if (!info) return null
    let suggestion = 'camera_0'
    if (cm) {
      try {
        const r = await cm.invokeService('proposeUniqName', {
          kind: 'camera', prefix: 'camera', sceneId: info.scene_uid,
        })
        suggestion = r?.name ?? suggestion
      } catch (err) {
        console.warn('proposeUniqName failed:', err)
      }
    }
    const entered = await showTextPrompt({
      title: 'New Camera',
      label: 'Name for new camera:',
      defaultValue: suggestion,
      confirmLabel: 'Create',
    })
    if (entered == null) return null
    const okd = await ops.createCamera(cm, info.scene_uid, info.view_id, entered)
    return okd ? entered.trim() : null
  })

  useRegisterCommand(CmdId.CameraDelete, async ({ name }) => {
    const info = getActiveSceneInfo()
    if (!info) return
    await ops.destroyCamera(cm, info.scene_uid, name)
  })

  useRegisterCommand(CmdId.CameraRename, async ({ oldName, newName }) => {
    const info = getActiveSceneInfo()
    if (!info) return false
    return ops.renameCamera(cm, info.scene_uid, oldName, newName)
  })

  useRegisterCommand(CmdId.CameraCopy, async ({ name }) => {
    const info = getActiveSceneInfo()
    if (!info) return false
    return ops.copyCamera(cm, info.scene_uid, name)
  })

  useRegisterCommand(CmdId.CameraPaste, async () => {
    const info = getActiveSceneInfo()
    if (!info) return
    await ops.pasteCamera(cm, info.scene_uid)
  })

  useRegisterCommand(CmdId.CameraReorder, async ({ names }) => {
    const info = getActiveSceneInfo()
    if (!info) return
    await ops.reorderCameras(cm, info.scene_uid, names)
  })

  useRegisterCommand(CmdId.CameraLoadFromFile, async () => {
    const info = getActiveSceneInfo()
    if (!info) return
    const r = await window.electronAPI.invoke(IPC.DIALOG_CAMERA_OPEN)
    if (r.canceled || !r.filePath) return
    await ops.loadCameraFromFile(cm, info.scene_uid, info.view_id, r.filePath)
  })

  useRegisterCommand(CmdId.CameraReload, async ({ name }) => {
    const info = getActiveSceneInfo()
    if (!info) return
    await ops.reloadCameraFromSrc(cm, info.scene_uid, name)
  })

  useRegisterCommand(CmdId.CameraSave, async ({ name }) => {
    const info = getActiveSceneInfo()
    if (!info) return
    const r = await ops.saveCameraToCurrentSrc(cm, info.scene_uid, name)
    // A camera with no source file falls through to Save As, as in UXP.
    if (!r.ok || r.saved) return
    const save = await window.electronAPI.invoke(IPC.DIALOG_CAMERA_SAVE, { defaultName: name })
    if (save.canceled || !save.filePath) return
    await ops.saveCameraToFile(cm, info.scene_uid, name, save.filePath)
  })

  useRegisterCommand(CmdId.CameraSaveAs, async ({ name }) => {
    const info = getActiveSceneInfo()
    if (!info) return
    const save = await window.electronAPI.invoke(IPC.DIALOG_CAMERA_SAVE, { defaultName: name })
    if (save.canceled || !save.filePath) return
    await ops.saveCameraToFile(cm, info.scene_uid, name, save.filePath)
  })

  useRegisterCommand(CmdId.CameraSaveFromView, async ({ name, withVisFlags }) => {
    const info = getActiveSceneInfo()
    if (!info) return
    await ops.saveViewToCamera(cm, info.scene_uid, info.view_id, name, withVisFlags)
  })

  useRegisterCommand(CmdId.CameraApplyToView, async ({ name, withVisFlags }) => {
    const info = getActiveSceneInfo()
    if (!info) return
    await ops.applyCameraToView(cm, info.scene_uid, info.view_id, name, withVisFlags)
  })

  useRegisterCommand(CmdId.CameraClearVisFlags, async ({ name }) => {
    const info = getActiveSceneInfo()
    if (!info) return
    await ops.clearCameraVisFlags(cm, info.scene_uid, name)
  })

  useRegisterCommand(CmdId.CameraEditVisFlags, async ({ name }) => {
    const info = getActiveSceneInfo()
    if (!cm || !info) return
    const sceneId = info.scene_uid
    let flags
    try {
      flags = await cm.invokeService('getCameraVisFlags', { sceneId, cameraName: name })
    } catch (err) {
      console.warn('getCameraVisFlags failed:', err)
      return
    }
    if (!flags?.ok) return
    const result = await showEditCameraVisFlags({ cameraName: name, entries: flags.entries })
    if (!result) return
    try {
      await cm.invokeService('setCameraVisFlags', {
        sceneId, cameraName: name, entries: result.entries,
      })
    } catch (err) {
      console.warn('setCameraVisFlags failed:', err)
    }
  })
}
