/**
 * IPC handler registration for the Electron main process.
 *
 * Call `registerIpcHandlers(mainWindow)` once after the BrowserWindow is
 * created. All channel names are imported from `shared/ipcChannels` so there
 * are no magic strings here.
 */

import { ipcMain, app, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import path from 'path'
import { IPC } from '../shared/ipcChannels'
import type { LayoutState, FileDialogOptions } from '../shared/ipcTypes'
import { loadLayout, saveLayout, loadUi, saveUi } from './stateStore'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getSysConfigPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'cuemol2', 'share', 'sysconfig.xml')
  }
  return ''
}

// ─────────────────────────────────────────────
// File open
// ─────────────────────────────────────────────

export async function handleOpenFile(mainWindow: BrowserWindow, options: FileDialogOptions): Promise<void> {
  const title = options.dialogType === 'open-scene' ? 'Open Scene' : 'Open File'
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    filters: options.filters,
    properties: ['openFile'],
  })

  if (!result.canceled && result.filePaths.length > 0) {
    for (const filePath of result.filePaths) {
      try {
        // Mol and scene files are loaded directly from disk by the C++ core.
        mainWindow.webContents.send(IPC.FILE_OPENED, {
          name: path.basename(filePath),
          path: filePath,
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

// ─────────────────────────────────────────────
// Handler registration
// ─────────────────────────────────────────────

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC.APP_PATH, async () => ({
    appPath: app.getAppPath(),
    exePath: app.getPath('exe'),
    modulePath: app.getPath('module'),
    isPackaged: app.isPackaged,
    sysConfigPath: getSysConfigPath(),
  }))

  ipcMain.handle(IPC.DIALOG_OPEN, async (_event, options: FileDialogOptions) => {
    await handleOpenFile(mainWindow, options)
  })

  ipcMain.handle(IPC.LAYOUT_LOAD, async (): Promise<LayoutState | null> => {
    return loadLayout() ?? null
  })

  ipcMain.handle(IPC.LAYOUT_SAVE, async (_event, layout: LayoutState): Promise<void> => {
    saveLayout(layout)
  })

  ipcMain.handle(IPC.UI_LOAD, () => loadUi())
  ipcMain.handle(IPC.UI_SAVE, (_e, state) => saveUi(state))
}
