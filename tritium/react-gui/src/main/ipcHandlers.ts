/**
 * IPC handler registration for the Electron main process.
 *
 * Call `registerIpcHandlers(mainWindow)` once after the BrowserWindow is
 * created. All channel names are imported from `shared/ipcChannels` so there
 * are no magic strings here.
 */

import { ipcMain, app, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { IPC } from '../shared/ipcChannels'
import type { LayoutState } from '../shared/ipcTypes'
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

export async function handleOpenFile(mainWindow: BrowserWindow): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open File',
    filters: [
      { name: 'All Supported', extensions: ['pdb', 'cif', 'mol2', 'sdf', 'qsc', 'json', 'py', 'txt'] },
      { name: 'CueMol Scene', extensions: ['qsc'] },
      { name: 'PDB Files', extensions: ['pdb'] },
      { name: 'mmCIF Files', extensions: ['cif'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })

  if (!result.canceled && result.filePaths.length > 0) {
    for (const filePath of result.filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        mainWindow.webContents.send(IPC.FILE_OPENED, {
          name: path.basename(filePath),
          path: filePath,
          content,
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

  ipcMain.handle(IPC.DIALOG_OPEN, async () => {
    await handleOpenFile(mainWindow)
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
