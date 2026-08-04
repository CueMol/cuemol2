/**
 * IPC handler registration for the Electron main process.
 *
 * Call `registerIpcHandlers(mainWindow)` once after the BrowserWindow is
 * created. All channel names come from `shared/ipcChannels` and request /
 * response shapes from `shared/ipcContract`.
 */

import { ipcMain, app, dialog, nativeTheme, shell, BrowserWindow } from 'electron'
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
 *   mirroring getSysConfigPath. On macOS and Windows these are staged into the
 *   bundle by tritium/packaging/collect-cuemol2-runtime.sh + electron-builder.yml
 *   extraResources (povray/ffmpeg/apbs from BUNDLE_APPS, blendpng from the
 *   libcuemol2 install tree). Linux staging is a follow-up (see ADR-0030).
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
      ffmpeg: path.join(res, 'bundle_apps', 'ffmpeg', 'bin', `ffmpeg${exe}`),
    }
  }
  const root = process.env.LIBCUEMOL2_ROOT
  const bundle = process.env.BUNDLE_APPS
  return {
    povrayExe: bundle ? path.join(bundle, 'povray', 'bin', `povray${exe}`) : '',
    povrayInc: bundle ? path.join(bundle, 'povray', 'include') : '',
    blendpng: root ? path.join(root, 'bin', `blendpng${exe}`) : '',
    ffmpeg: bundle ? path.join(bundle, 'ffmpeg', 'bin', `ffmpeg${exe}`) : '',
  }
}

/**
 * Resolve the default APBS / pdb2pqr executable paths. The renderer
 * (ApbsConfigContext) uses these as the fallback when the user has not set an
 * explicit path in Settings. Same strategy as getRenderBinaries: packaged
 * builds resolve from the bundled `bundle_apps/apbs` tree under
 * process.resourcesPath (staged by collect-cuemol2-runtime.sh), dev builds from
 * the BUNDLE_APPS env var. The executable names match the extpkgs layout
 * (UXP parity): `apbs` / `apbs.exe`, and `pdb2pqr` / `pdb2pqr_wrap.bat`.
 */
function getApbsBinaries(): AppPathInfo['defaultApbsBinaries'] {
  const exe = process.platform === 'win32' ? '.exe' : ''
  const pdb2pqrName = process.platform === 'win32' ? 'pdb2pqr_wrap.bat' : 'pdb2pqr'
  if (app.isPackaged) {
    const res = process.resourcesPath
    return {
      apbsExe: path.join(res, 'bundle_apps', 'apbs', `apbs${exe}`),
      pdb2pqrExe: path.join(res, 'bundle_apps', 'apbs', pdb2pqrName),
    }
  }
  const bundle = process.env.BUNDLE_APPS
  return {
    apbsExe: bundle ? path.join(bundle, 'apbs', `apbs${exe}`) : '',
    pdb2pqrExe: bundle ? path.join(bundle, 'apbs', pdb2pqrName) : '',
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
      defaultApbsBinaries: getApbsBinaries(),
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

  handleInvoke(IPC.FILE_EXISTS, (_event, payload) => handleFileExists(payload.path))

  // Open a produced file (e.g. a rendered movie) in the OS default app.
  handleInvoke(IPC.SHELL_OPEN_PATH, async (_event, { path: p }) => {
    const error = await shell.openPath(p)
    return { ok: error === '', ...(error ? { error } : {}) }
  })

  // Reveal a produced file in Finder / Explorer.
  handleInvoke(IPC.SHELL_REVEAL_PATH, (_event, { path: p }) => {
    shell.showItemInFolder(p)
    return { ok: true }
  })

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

  // Edit role picked from the Windows/Linux React text context menu
  // (registerTextContextMenu pushes IPC.TEXT_CTX_SHOW; selectAll is handled
  // renderer-side and never reaches here).
  handleInvoke(IPC.TEXT_CTX_ACTION, (_event, role) => {
    const wc = mainWindow.webContents
    switch (role) {
      case 'cut': wc.cut(); break
      case 'copy': wc.copy(); break
      case 'paste': wc.paste(); break
    }
  })

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

  /**
   * UI zoom is app-wide, not per window: the Rendering window shares the main
   * window's design tokens, so leaving it at 100% while the main window is
   * zoomed makes the same header / tab strip render at two different sizes.
   * A window opened later adopts the level in windowManager.
   */
  const setUiZoomLevel = (level: number): void => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.setZoomLevel(level)
  }

  handleInvoke(IPC.MENU_INVOKE_ROLE, (_event, role) => {
    const wc = mainWindow.webContents
    switch (role) {
      case 'reload': wc.reload(); break
      case 'forceReload': wc.reloadIgnoringCache(); break
      case 'toggleDevTools': wc.toggleDevTools(); break
      case 'resetZoom': setUiZoomLevel(0); break
      case 'zoomIn': setUiZoomLevel(wc.getZoomLevel() + 0.5); break
      case 'zoomOut': setUiZoomLevel(wc.getZoomLevel() - 0.5); break
      case 'togglefullscreen': mainWindow.setFullScreen(!mainWindow.isFullScreen()); break
      case 'about': app.showAboutPanel(); break
      case 'quit': app.quit(); break
      case 'close': mainWindow.close(); break
    }
  })

  /**
   * Window > Main Window. The Rendering window is an independent top-level
   * window (not a child), so normal z-order applies and a plain focus() is
   * enough to raise the main window above it. Minimized / hidden are restored
   * first so the entry always ends with the window on screen.
   */
  handleInvoke(IPC.WINDOW_FOCUS_MAIN, () => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}
