/**
 * @file main/windows/mainWindow.ts
 * @description The main application window: creation and lifecycle wiring.
 *
 * This is where the app's IPC surface is registered, so there is exactly one
 * of these by construction (see createWindow).
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { loadWindowBounds, saveWindowBounds } from '../stateStore'
import { registerIpcHandlers } from '../ipcHandlers'
import { registerRenderWindowIpc } from '../renderWindowIpc'
import { resetMenuBlockReason, createMenu } from '../menu'
import { registerTextContextMenu } from '../textContextMenu'
import { registerCuemolClipboardIpc } from '../cuemolClipboard'
import { APP_PRODUCT_NAME } from '@shared/appInfo'
import { IPC } from '@shared/ipcChannels'
import { setAppQuitting, setCloseConfirmed, setForceQuit } from '../quitState'
import { chromeWindowOptions, forwardConsoleMessages, hideMenuBar } from './windowChrome'
import { isVisibleOnAnyDisplay, trackWindowState } from './windowState'
import { handleWindowClose } from './closeFunnel'
import { createOrFocusRenderWindow, getRenderWindow } from './renderWindow'

let mainWindow: BrowserWindow | null = null

/**
 * The main application window, or null before it exists / after it closed.
 *
 * Symmetric with getRenderWindow(). Use this rather than
 * BrowserWindow.getAllWindows()[0], which can return the Rendering window.
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/** Bring the main window to the front, restoring it if minimized. */
export function focusMainWindow(): void {
  const win = getMainWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/**
 * Watch the renderer process for the states it cannot report itself.
 *
 * A crash and a reload both leave main holding state the renderer owed it:
 * a crash leaves the close funnel waiting for a confirm that will never
 * come, and a reload discards every component that owed a menu-unblock.
 */
function watchRendererProcess(win: BrowserWindow): void {
  // Renderer process crashed (segfault, OOM, or process.crash). The confirm
  // funnel cannot complete because the renderer is dead -- mark every closure
  // path satisfied and exit immediately.
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(
      '[Main] render-process-gone:',
      details.reason,
      'exitCode=' + details.exitCode,
    )
    setCloseConfirmed(win, true)
    setForceQuit(true)
    setAppQuitting(true)
    app.exit(1)
  })

  // The 'blueprint' block count is incremented when a dialog mounts and
  // decremented when it unmounts, both from the renderer, so a reload with a
  // dialog open left the count stuck above zero and every menu item except the
  // text-edit ones disabled for the rest of the run -- Cmd+Q included, with no
  // way to recover. Main sees the navigation, so it clears the reason here.
  win.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) resetMenuBlockReason('blueprint')
  })

  // Renderer is hung (e.g. infinite loop in JS or blocked on a sync call).
  // Logged but not auto-killed -- transient stalls are common during heavy
  // work and false-positive force-quits would be worse than the symptom.
  win.webContents.on('unresponsive', () => {
    console.error('[Main] renderer unresponsive')
  })
  win.webContents.on('responsive', () => {
    console.log('[Main] renderer responsive again')
  })
}

/** Create the main window. A second call is a no-op (see below). */
export function createWindow(): void {
  // registerIpcHandlers() calls ipcMain.handle() unguarded, so a second call
  // would throw on the first duplicate channel. Only one main window exists
  // by design.
  if (getMainWindow()) return

  const saved = loadWindowBounds()
  const boundsOnScreen = saved ? isVisibleOnAnyDisplay(saved) : false

  const win = new BrowserWindow({
    width: boundsOnScreen ? saved!.width : 1400,
    height: boundsOnScreen ? saved!.height : 900,
    ...(boundsOnScreen ? { x: saved!.x, y: saved!.y } : {}),
    minWidth: 400,
    minHeight: 300,
    // Base title; the renderer appends the active scene:view through
    // IPC.WINDOW_SET_TITLE (UXP `Qm2Main.setWindowTitle` parity).
    title: APP_PRODUCT_NAME,
    ...chromeWindowOptions({ worker: true }),
  })

  mainWindow = win

  hideMenuBar(win)

  if (saved?.isMaximized) {
    win.maximize()
  }

  win.on('ready-to-show', () => {
    win.show()
    win.focus()
  })

  forwardConsoleMessages(win, '[Renderer]')
  watchRendererProcess(win)

  trackWindowState(win, loadWindowBounds, saveWindowBounds)
  registerTextContextMenu(win)
  registerIpcHandlers(win)
  registerCuemolClipboardIpc()
  registerRenderWindowIpc({
    mainWindow: win,
    getRenderWindow,
    openRenderWindow: () => createOrFocusRenderWindow(win),
  })
  createMenu(win)

  // Close confirm funnel (separate from trackWindowState's bounds-saving
  // 'close' listener; both listeners fire on close).
  win.on('close', (event) => handleWindowClose(win, event))

  // The Rendering window is not a child of this one (see
  // createOrFocusRenderWindow), so it does not auto-close with it. Close it
  // here so all windows are gone -> 'window-all-closed' fires -> the app quits.
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
    const rw = getRenderWindow()
    if (rw && !rw.isDestroyed()) rw.close()
  })

  // macOS trackpad 2-finger rotate gesture: Chromium does not emit a DOM
  // event for this, so we capture it here and push it to the renderer via IPC.
  // On non-macOS this event never fires but attaching is harmless.
  win.on('rotate-gesture', (_event, rotation) => {
    win.webContents.send(IPC.ROTATE_GESTURE, rotation)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'undocked' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
