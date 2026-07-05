/**
 * IPC handler registration for the Electron main process.
 *
 * Call `registerIpcHandlers(mainWindow)` once after the BrowserWindow is
 * created. All channel names come from `shared/ipcChannels` and request /
 * response shapes from `shared/ipcContract`.
 */

import { ipcMain, app, dialog, nativeTheme } from 'electron'
import type { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { IPC } from '../shared/ipcChannels'
import type {
  InvokeChannel,
  InvokeReq,
  InvokeRes,
} from '../shared/ipcContract'
import type { AppPathInfo, FileDialogOptions } from '../shared/ipcTypes'
import { loadLayout, saveLayout, loadUi, saveUi } from './stateStore'
import { showNaviContextMenu } from './naviContextMenu'
import { showSceneContextMenu } from './sceneContextMenu'
import { inferContentFirst } from './helpers/inferContentFirst'
import { rebuildApplicationMenu, setMenuBlocked, updateMenuState, withMenuBlocked } from './menu'
import { addRecent, clearRecents, getRecents } from './recentFiles'
import {
  clearCloseWatchdog,
  setAppQuitting,
  setCloseConfirmed,
  setCloseInFlight,
  setForceQuit,
} from './quitState'
import {
  handleSaveSceneDialog,
  handleStyleOpenDialog,
  handleStyleSaveDialog,
  handleCameraOpenDialog,
  handleCameraSaveDialog,
  handleSceneExportDialog,
  handleObjectSaveDialog,
  handlePickPathDialog,
  handleSaveTextAsDialog,
} from './handlers/fileDialogs'

// --- Typed handle wrapper ---

/**
 * Type-safe wrapper for `ipcMain.handle`. Picks request / response types from
 * `InvokeChannels` so adding a channel only requires adding a map entry plus a
 * handler call.
 */
export function handleInvoke<C extends InvokeChannel>(
  channel: C,
  handler: (
    event: Electron.IpcMainInvokeEvent,
    req: InvokeReq<C>,
  ) => InvokeRes<C> | Promise<InvokeRes<C>>,
): void {
  ipcMain.handle(channel, handler as Parameters<typeof ipcMain.handle>[1])
}

// --- Helpers ---

function getSysConfigPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'cuemol2', 'share', 'sysconfig.xml')
  }
  return ''
}

function getUserStylePath(): string {
  return path.join(app.getPath('userData'), 'user_styles.xml')
}

/**
 * Resolve the default external render-binary paths (POV-Ray executable +
 * include dir, blendpng). The renderer (RenderConfigContext) uses these as the
 * fallback when the user has not set an explicit path in Settings.
 *
 * - Packaged: resolved from the app install tree under process.resourcesPath,
 *   mirroring getSysConfigPath. NOTE: staging these binaries into the bundle is
 *   not implemented yet (see ADR-0030); the paths describe the intended layout.
 * - Dev: resolved from the build-output env vars the Taskfile run task exports
 *   -- LIBCUEMOL2_ROOT (cuemol2 install prefix, holds bin/blendpng) and
 *   BUNDLE_APPS (parent of the downloaded povray/ tree). A field is the empty
 *   string when its env var is unset, so the renderer keeps its compiled-in
 *   default.
 */
function getRenderBinaries(): AppPathInfo['defaultRenderBinaries'] {
  const exe = process.platform === 'win32' ? '.exe' : ''
  if (app.isPackaged) {
    const res = process.resourcesPath
    return {
      povrayExe: path.join(res, 'bundle_apps', 'povray', 'bin', `povray${exe}`),
      povrayInc: path.join(res, 'bundle_apps', 'povray', 'include'),
      blendpng: path.join(res, 'cuemol2', 'bin', `blendpng${exe}`),
    }
  }
  const root = process.env.LIBCUEMOL2_ROOT
  const bundle = process.env.BUNDLE_APPS
  return {
    povrayExe: bundle ? path.join(bundle, 'povray', 'bin', `povray${exe}`) : '',
    povrayInc: bundle ? path.join(bundle, 'povray', 'include') : '',
    blendpng: root ? path.join(root, 'bin', `blendpng${exe}`) : '',
  }
}

// --- File open ---


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

// --- File-system ops ---

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

// --- Handler registration ---

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
      defaultRenderBinaries: getRenderBinaries(),
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

  handleInvoke(IPC.DIALOG_SCENE_EXPORT, async (_event, payload) =>
    handleSceneExportDialog(mainWindow, payload),
  )

  handleInvoke(IPC.DIALOG_OBJECT_SAVE, async (_event, payload) =>
    handleObjectSaveDialog(mainWindow, payload),
  )

  handleInvoke(IPC.DIALOG_PICK_PATH, async (_event, payload) =>
    handlePickPathDialog(mainWindow, payload),
  )

  handleInvoke(IPC.SAVE_TEXT_AS, async (_event, payload) =>
    handleSaveTextAsDialog(mainWindow, payload),
  )

  handleInvoke(IPC.FILE_EXISTS, (_event, payload) => handleFileExists(payload.path))

  handleInvoke(IPC.FILE_BACKUP_RENAME, (_event, payload) => handleBackupRename(payload.path))

  handleInvoke(IPC.LAYOUT_LOAD, async () => loadLayout() ?? null)

  handleInvoke(IPC.LAYOUT_SAVE, async (_event, layout) => {
    saveLayout(layout)
  })

  handleInvoke(IPC.UI_LOAD, () => loadUi())
  handleInvoke(IPC.UI_SAVE, (_e, state) => {
    saveUi(state)
    // Keep the native window chrome (macOS titlebar hairline, overlay
    // controls) aligned with the UI theme.
    if (state.theme) nativeTheme.themeSource = state.theme
  })
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

  // Renderer reply to a WINDOW_CLOSE_REQUEST. `proceed: true` means every
  // tab is confirmed/closed: mark the window confirmed and re-issue close()
  // so the funnel lets it through. `proceed: false` (user cancelled) clears
  // the in-flight flag and aborts any in-progress quit so the next Cmd+Q
  // starts a fresh confirm chain.
  handleInvoke(IPC.WINDOW_CLOSE_PROCEED, (_event, { proceed }) => {
    clearCloseWatchdog(mainWindow)
    setCloseInFlight(mainWindow, false)
    if (proceed) {
      setCloseConfirmed(mainWindow, true)
      mainWindow.close()
    } else {
      setAppQuitting(false)
    }
  })

  // Renderer-side crash report. The renderer's CrashReporter forwards
  // every crash source (window.onerror, unhandledrejection, ErrorBoundary,
  // worker.onerror, worker postMessage crash, render-loop) here so the
  // stack lands in stderr regardless of whether DevTools is open.
  handleInvoke(IPC.CRASH_REPORT, (_event, report) => {
    console.error('[Crash][' + report.source + ']', report.message)
    if (report.filename) {
      const loc = report.lineno !== undefined
        ? `${report.filename}:${report.lineno}:${report.colno ?? 0}`
        : report.filename
      console.error('  at', loc)
    }
    if (report.stack) console.error(report.stack)
    if (report.componentStack) {
      console.error('Component stack:' + report.componentStack)
    }
  })

  // Quit button on the crash fallback UI. Bypass the close-confirm funnel
  // entirely -- the renderer is broken so there is nothing to confirm.
  handleInvoke(IPC.FORCE_QUIT, () => {
    setForceQuit(true)
    setAppQuitting(true)
    for (const w of mainWindow.isDestroyed() ? [] : [mainWindow]) {
      clearCloseWatchdog(w)
      setCloseConfirmed(w, true)
    }
    app.exit(0)
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
