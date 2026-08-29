/**
 * @file state/sceneTree/commands/useCameraCommands.ts
 * @description Handlers for the camera entries of the scene-tree context
 * menu.
 *
 * Cameras are addressed by name: a registered camera has no uid, and the
 * scene-tree rows carry synthesised negative ids. Everything that touches
 * the live view needs the active molview, so those are no-ops without one.
 */

import { IPC } from '@shared/ipcChannels'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { UseSceneTreeResult } from '@renderer/hooks/useSceneTree'
import { useShowEditCameraVisFlagsDialog } from '@renderer/components/dialogs/EditCameraVisFlagsDialogProvider'
import { useRegisterCommand } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'

export interface CameraCommandsOptions {
  cm: AsyncCueMol | null
  sceneId: number | undefined
  activeViewId: number | undefined
  scene: UseSceneTreeResult
  /** The shared "New Camera..." flow, also run by the toolbar Add button. */
  openNewCameraFlow: () => Promise<void>
}

export function useCameraCommands({
  cm,
  sceneId,
  activeViewId,
  scene,
  openNewCameraFlow,
}: CameraCommandsOptions): void {
  const showEditCameraVisFlags = useShowEditCameraVisFlagsDialog()

  useRegisterCommand(CmdId.CameraNew, () => openNewCameraFlow())

  useRegisterCommand(CmdId.CameraLoadFromFile, async () => {
    if (activeViewId === undefined) return
    const r = await window.electronAPI.invoke(IPC.DIALOG_CAMERA_OPEN)
    if (r.canceled || !r.filePath) return
    await scene.loadCameraFromFile(activeViewId, r.filePath)
  })

  useRegisterCommand(CmdId.CameraReload, async ({ name }) => {
    await scene.reloadCameraFromSrc(name)
  })

  useRegisterCommand(CmdId.CameraSave, async ({ name }) => {
    const r = await scene.saveCameraToCurrentSrc(name)
    // A camera with no source file falls through to Save As, as in UXP.
    if (!r.ok || r.saved) return
    const save = await window.electronAPI.invoke(IPC.DIALOG_CAMERA_SAVE, { defaultName: name })
    if (save.canceled || !save.filePath) return
    await scene.saveCameraToFile(name, save.filePath)
  })

  useRegisterCommand(CmdId.CameraSaveAs, async ({ name }) => {
    const save = await window.electronAPI.invoke(IPC.DIALOG_CAMERA_SAVE, { defaultName: name })
    if (save.canceled || !save.filePath) return
    await scene.saveCameraToFile(name, save.filePath)
  })

  useRegisterCommand(CmdId.CameraSaveFromView, async ({ name, withVisFlags }) => {
    if (activeViewId === undefined) return
    await scene.saveViewToCamera(activeViewId, name, withVisFlags)
  })

  useRegisterCommand(CmdId.CameraApplyToView, async ({ name, withVisFlags }) => {
    if (activeViewId === undefined) return
    await scene.applyCameraToView(activeViewId, name, withVisFlags)
  })

  useRegisterCommand(CmdId.CameraClearVisFlags, async ({ name }) => {
    await scene.clearCameraVisFlags(name)
  })

  useRegisterCommand(CmdId.CameraEditVisFlags, async ({ name }) => {
    if (!cm || sceneId === undefined) return
    let info
    try {
      info = await cm.invokeService('getCameraVisFlags', { sceneId, cameraName: name })
    } catch (err) {
      console.warn('getCameraVisFlags failed:', err)
      return
    }
    if (!info?.ok) return
    const result = await showEditCameraVisFlags({ cameraName: name, entries: info.entries })
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
