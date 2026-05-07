/**
 * IPC handler registration for the Electron main process.
 *
 * Call `registerIpcHandlers(mainWindow)` once after the BrowserWindow is
 * created. All channel names come from `shared/ipcChannels` and request /
 * response shapes from `shared/ipcContract`.
 */

import { ipcMain, app, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { IPC } from '../shared/ipcChannels'
import type {
  InvokeChannel,
  InvokeReq,
  InvokeRes,
} from '../shared/ipcContract'
import type { FileDialogOptions } from '../shared/ipcTypes'
import { loadLayout, saveLayout, loadUi, saveUi } from './stateStore'
import { showNaviContextMenu } from './naviContextMenu'
import { updateMenuState } from './menu'

// ─────────────────────────────────────────────
// Typed handle wrapper
// ─────────────────────────────────────────────

/**
 * Type-safe wrapper for `ipcMain.handle`. Picks request / response types from
 * `InvokeChannels` so adding a channel only requires adding a map entry plus a
 * handler call.
 */
function handleInvoke<C extends InvokeChannel>(
  channel: C,
  handler: (
    event: Electron.IpcMainInvokeEvent,
    req: InvokeReq<C>,
  ) => InvokeRes<C> | Promise<InvokeRes<C>>,
): void {
  ipcMain.handle(channel, handler as Parameters<typeof ipcMain.handle>[1])
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getSysConfigPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'cuemol2', 'share', 'sysconfig.xml')
  }
  return ''
}

function getUserStylePath(): string {
  return path.join(app.getPath('userData'), 'user_styles.xml')
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
        // Obj and scene files are loaded directly from disk by the C++ core.
        const channel = options.dialogType === 'open-scene'
          ? IPC.SCENE_FILE_OPENED
          : IPC.OBJ_FILE_OPENED
        mainWindow.webContents.send(channel, {
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
  handleInvoke(IPC.APP_PATH, async () => {
    const userStylePath = getUserStylePath()
    let userStyleExists = false
    try {
      userStyleExists = fs.existsSync(userStylePath)
    } catch (e) {
      console.warn('userStyle existsSync failed:', e)
    }
    return {
      appPath: app.getAppPath(),
      exePath: app.getPath('exe'),
      modulePath: app.getPath('module'),
      isPackaged: app.isPackaged,
      sysConfigPath: getSysConfigPath(),
      userStylePath,
      userStyleExists,
    }
  })

  handleInvoke(IPC.DIALOG_OPEN, async (_event, options) => {
    await handleOpenFile(mainWindow, options)
  })

  handleInvoke(IPC.LAYOUT_LOAD, async () => loadLayout() ?? null)

  handleInvoke(IPC.LAYOUT_SAVE, async (_event, layout) => {
    saveLayout(layout)
  })

  handleInvoke(IPC.UI_LOAD, () => loadUi())
  handleInvoke(IPC.UI_SAVE, (_e, state) => saveUi(state))
  handleInvoke(IPC.MENU_UPDATE_STATE, (_e, state) => updateMenuState(state))

  handleInvoke(IPC.NAVI_CTX_SHOW, (_event, payload) =>
    showNaviContextMenu(mainWindow, payload),
  )

  handleInvoke(IPC.MENU_INVOKE_ROLE, (_event, role) => {
    const wc = mainWindow.webContents
    switch (role) {
      case 'reload': wc.reload(); break
      case 'forceReload': wc.reloadIgnoringCache(); break
      case 'toggleDevTools': wc.toggleDevTools(); break
      case 'resetZoom': wc.setZoomLevel(0); break
      case 'zoomIn': wc.setZoomLevel(wc.getZoomLevel() + 0.5); break
      case 'zoomOut': wc.setZoomLevel(wc.getZoomLevel() - 0.5); break
      case 'togglefullscreen': mainWindow.setFullScreen(!mainWindow.isFullScreen()); break
      case 'about': app.showAboutPanel(); break
      case 'quit': app.quit(); break
      case 'close': mainWindow.close(); break
    }
  })
}
