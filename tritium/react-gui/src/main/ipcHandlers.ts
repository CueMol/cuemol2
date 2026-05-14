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
import { showSceneContextMenu } from './sceneContextMenu'
import { rebuildApplicationMenu, setMenuBlocked, updateMenuState, withMenuBlocked } from './menu'
import { addRecent, clearRecents, getRecents } from './recentFiles'
import { setQuitConfirmed } from './quitState'

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
// Scene save helpers
// ─────────────────────────────────────────────

async function handleSaveSceneDialog(
  mainWindow: BrowserWindow,
  defaultName: string,
): Promise<{ canceled: boolean; filePath: string }> {
  const result = await withMenuBlocked('native', () =>
    dialog.showSaveDialog(mainWindow, {
      title: 'Save Scene As',
      defaultPath: defaultName,
      filters: [
        { name: 'CueMol Scene', extensions: ['qsc'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    }),
  )
  return {
    canceled: result.canceled,
    filePath: result.filePath ?? '',
  }
}

// ─────────────────────────────────────────────
// Style file dialogs (Phase 5c)
// ─────────────────────────────────────────────
//
// UXP uses `fp.appendFilter("Style file (*.xml)", "*.xml")` on the
// nsIFilePicker for both load and save. The worker side performs the
// actual `StyleManager.loadStyleSetFromFile` / `saveStyleSetToFile` call
// once we return the resolved path.

async function handleStyleOpenDialog(
  mainWindow: BrowserWindow,
): Promise<{ canceled: boolean; filePath: string }> {
  const result = await withMenuBlocked('native', () =>
    dialog.showOpenDialog(mainWindow, {
      title: 'Open Style File',
      filters: [
        { name: 'Style file', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    }),
  )
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, filePath: '' }
  }
  return { canceled: false, filePath: result.filePaths[0] }
}

async function handleStyleSaveDialog(
  mainWindow: BrowserWindow,
  defaultName: string,
): Promise<{ canceled: boolean; filePath: string }> {
  const result = await withMenuBlocked('native', () =>
    dialog.showSaveDialog(mainWindow, {
      title: 'Save Style As',
      defaultPath: defaultName,
      filters: [
        { name: 'Style file', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    }),
  )
  return {
    canceled: result.canceled,
    filePath: result.filePath ?? '',
  }
}

// ─────────────────────────────────────────────
// Camera file dialogs (Phase 5b)
// ─────────────────────────────────────────────
//
// UXP uses an unfiltered nsIFilePicker for camera files (the on-disk
// format is XML). We add the same .xml + All Files pair so the dialog
// is consistent with the style-file picker.

async function handleCameraOpenDialog(
  mainWindow: BrowserWindow,
): Promise<{ canceled: boolean; filePath: string }> {
  const result = await withMenuBlocked('native', () =>
    dialog.showOpenDialog(mainWindow, {
      title: 'Open Camera File',
      filters: [
        { name: 'Camera file', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    }),
  )
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, filePath: '' }
  }
  return { canceled: false, filePath: result.filePaths[0] }
}

async function handleCameraSaveDialog(
  mainWindow: BrowserWindow,
  defaultName: string,
): Promise<{ canceled: boolean; filePath: string }> {
  const result = await withMenuBlocked('native', () =>
    dialog.showSaveDialog(mainWindow, {
      title: 'Save Camera As',
      defaultPath: defaultName,
      filters: [
        { name: 'Camera file', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    }),
  )
  return {
    canceled: result.canceled,
    filePath: result.filePath ?? '',
  }
}

// ─────────────────────────────────────────────
// Object save-as (ScenePane ctxmenu)
// ─────────────────────────────────────────────
//
// The filter list is built worker-side from
// `StreamManager.findCompatibleWriterNamesForObj` × the writer category
// of `StreamManager.getInfoJSON2`; the renderer forwards it here. We
// surface the selected filter index back to the caller so the worker can
// pass the matching writer name to `createHandler`.

async function handleObjectSaveDialog(
  mainWindow: BrowserWindow,
  payload: {
    defaultDir: string
    defaultName: string
    filters: { name: string; extensions: string[] }[]
    defaultFilterIndex?: number
  },
): Promise<{ canceled: boolean; filePath: string; filterIndex: number }> {
  const defaultPath = payload.defaultDir
    ? path.join(payload.defaultDir, payload.defaultName)
    : payload.defaultName
  const result = await withMenuBlocked('native', () =>
    dialog.showSaveDialog(mainWindow, {
      title: 'Save Object As',
      defaultPath,
      filters: [
        ...payload.filters,
        { name: 'All Files', extensions: ['*'] },
      ],
    }),
  )
  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: '', filterIndex: -1 }
  }
  // Electron does not return the chosen filter index. Best-effort
  // recover it from the file extension. Falls back to defaultFilterIndex
  // (or 0) when no match — the worker will use that writer name.
  const ext = (result.filePath.split('.').pop() ?? '').toLowerCase()
  let filterIndex = payload.defaultFilterIndex ?? 0
  for (let i = 0; i < payload.filters.length; i++) {
    if (payload.filters[i].extensions.some((e) => e.toLowerCase() === ext)) {
      filterIndex = i
      break
    }
  }
  return { canceled: false, filePath: result.filePath, filterIndex }
}

function handleFileExists(target: string): { exists: boolean } {
  try {
    return { exists: fs.existsSync(target) }
  } catch {
    return { exists: false }
  }
}

function handleBackupRename(target: string): { ok: boolean; backed: boolean; error?: string } {
  try {
    if (!fs.existsSync(target)) return { ok: true, backed: false }
    const backup = `${target}.bak`
    if (fs.existsSync(backup)) {
      try { fs.unlinkSync(backup) } catch { /* ignore */ }
    }
    fs.renameSync(target, backup)
    return { ok: true, backed: true }
  } catch (e) {
    return { ok: false, backed: false, error: (e as Error).message }
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

  handleInvoke(IPC.DIALOG_OBJECT_SAVE, async (_event, payload) =>
    handleObjectSaveDialog(mainWindow, payload),
  )

  handleInvoke(IPC.FILE_EXISTS, (_event, payload) => handleFileExists(payload.path))

  handleInvoke(IPC.FILE_BACKUP_RENAME, (_event, payload) => handleBackupRename(payload.path))

  handleInvoke(IPC.LAYOUT_LOAD, async () => loadLayout() ?? null)

  handleInvoke(IPC.LAYOUT_SAVE, async (_event, layout) => {
    saveLayout(layout)
  })

  handleInvoke(IPC.UI_LOAD, () => loadUi())
  handleInvoke(IPC.UI_SAVE, (_e, state) => saveUi(state))
  handleInvoke(IPC.MENU_UPDATE_STATE, (_e, state) => updateMenuState(state))
  handleInvoke(IPC.MENU_SET_MODAL_BLOCKED, (_e, blocked) =>
    setMenuBlocked('blueprint', blocked),
  )

  handleInvoke(IPC.RECENT_LOAD, () => getRecents())
  handleInvoke(IPC.RECENT_ADD, (_e, entry) => {
    const next = addRecent(entry)
    // OS-level integration (macOS Dock recent items / Windows Jump List).
    try { app.addRecentDocument(entry.path) } catch { /* non-fatal */ }
    rebuildApplicationMenu()
    mainWindow.webContents.send(IPC.RECENT_UPDATED, next)
  })
  handleInvoke(IPC.RECENT_CLEAR, () => {
    const next = clearRecents()
    try { app.clearRecentDocuments() } catch { /* non-fatal */ }
    rebuildApplicationMenu()
    mainWindow.webContents.send(IPC.RECENT_UPDATED, next)
  })

  handleInvoke(IPC.SCENE_CTX_SHOW, (_event, payload) =>
    showSceneContextMenu(mainWindow, payload),
  )

  handleInvoke(IPC.NAVI_CTX_SHOW, (_event, payload) =>
    showNaviContextMenu(mainWindow, payload),
  )

  handleInvoke(IPC.APP_QUIT_PROCEED, () => {
    setQuitConfirmed(true)
    app.quit()
  })

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
