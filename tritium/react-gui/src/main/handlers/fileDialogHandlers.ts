/**
 * @file main/handlers/fileDialogHandlers.ts
 * @description IPC registration for the native file dialogs.
 *
 * The dialogs themselves live in `fileDialogs.ts`; this is the channel wiring,
 * kept apart so the prompt helpers stay callable without going through IPC.
 */

import { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { handleInvoke } from '../ipc/handleInvoke';
import { handleOpenFile } from '../fileOpen';
import {
  handleCameraOpenDialog,
  handleCameraSaveDialog,
  handleObjectSaveDialog,
  handlePickPathDialog,
  handleSaveSceneDialog,
  handleSaveTextAsDialog,
  handleSceneExportDialog,
  handleStyleOpenDialog,
  handleStyleSaveDialog,
} from './fileDialogs';

/** Register the dialog channels. */
export function registerFileDialogHandlers(mainWindow: BrowserWindow): void {
  handleInvoke(IPC.DIALOG_OPEN, async (_event, options) => {
    await handleOpenFile(mainWindow, options)
  })

  handleInvoke(IPC.DIALOG_SAVE_SCENE, async (_event, payload) =>
    handleSaveSceneDialog(mainWindow, payload.defaultName),
  )

  handleInvoke(IPC.DIALOG_STYLE_OPEN, async () => handleStyleOpenDialog(mainWindow))

  handleInvoke(IPC.DIALOG_STYLE_SAVE, async (_event, payload) =>
    handleStyleSaveDialog(mainWindow, payload.defaultName),
  )

  handleInvoke(IPC.DIALOG_CAMERA_OPEN, async () => handleCameraOpenDialog(mainWindow))

  handleInvoke(IPC.DIALOG_CAMERA_SAVE, async (_event, payload) =>
    handleCameraSaveDialog(mainWindow, payload.defaultName),
  )

  handleInvoke(IPC.DIALOG_SCENE_EXPORT, async (_event, payload) =>
    handleSceneExportDialog(mainWindow, payload),
  )

  handleInvoke(IPC.DIALOG_OBJECT_SAVE, async (_event, payload) =>
    handleObjectSaveDialog(mainWindow, payload),
  )

  handleInvoke(IPC.DIALOG_PICK_PATH, async (_event, payload) =>
    // Parent the picker to the window that asked for it, so a request from
    // the Rendering window is modal to that window, not the main one.
    handlePickPathDialog(
      BrowserWindow.fromWebContents(_event.sender) ?? mainWindow,
      payload,
    ),
  )

  handleInvoke(IPC.SAVE_TEXT_AS, async (_event, payload) =>
    handleSaveTextAsDialog(mainWindow, payload),
  )
}
