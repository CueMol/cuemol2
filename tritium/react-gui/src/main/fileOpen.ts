/**
 * @file main/fileOpen.ts
 * @description The Open File flow: show the picker, then hand each chosen
 * path to the renderer.
 *
 * Lives outside the handler modules because the shell-open queue and the
 * command line reach it too, not only the IPC channel.
 */

import { dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'path';
import { IPC } from '@shared/ipcChannels';
import type { FileDialogOptions } from '@shared/types/fileDialog';
import { withMenuBlocked } from './menu';
import { inferContentFirst } from './helpers/inferContentFirst';



export async function handleOpenFile(mainWindow: BrowserWindow, options: FileDialogOptions): Promise<void> {
  const title = options.dialogType === 'open-scene' ? 'Open Scene' : 'Open File'
  const result = await withMenuBlocked('native', () =>
    dialog.showOpenDialog(mainWindow, {
      title,
      filters: options.filters,
      properties: ['openFile'],
    }),
  )

  if (!result.canceled && result.filePaths.length > 0) {
    for (const filePath of result.filePaths) {
      try {
        // Obj and scene files are loaded directly from disk by the C++ core.
        const channel = options.dialogType === 'open-scene'
          ? IPC.SCENE_FILE_OPENED
          : IPC.OBJ_FILE_OPENED
        // Scene files (.qsc) have a single registered reader, so the
        // content-sniff path is irrelevant; force false.
        const contentFirst = options.dialogType === 'open-scene'
          ? false
          : inferContentFirst(filePath, options.filters)
        mainWindow.webContents.send(channel, {
          name: path.basename(filePath),
          path: filePath,
          contentFirst,
        })
      } catch (err) {
        mainWindow.webContents.send(IPC.FILE_ERROR, {
          path: filePath,
          error: (err as Error).message,
        })
      }
    }
  }
}
