/**
 * BrowserWindow creation and lifecycle management.
 */

import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import {
  loadRenderWindowBounds,
  loadWindowBounds,
  saveRenderWindowBounds,
  saveWindowBounds,
  type WindowBounds,
} from './stateStore'
import { registerIpcHandlers } from './ipcHandlers'
import { registerRenderWindowIpc } from './renderWindowIpc'
import { isBlocked, resetMenuBlockReason, createMenu } from './menu'
import { registerTextContextMenu } from './textContextMenu'
import { registerCuemolClipboardIpc } from './cuemolClipboard'
import { getDevIconPath } from './helpers/appIcon'
import { APP_PRODUCT_NAME } from '@shared/appInfo'
import { IPC } from '@shared/ipcChannels'
import {
  clearCloseWatchdog,
  isCloseConfirmed,
  isCloseInFlight,
  setAppQuitting,
  setCloseConfirmed,
  setCloseInFlight,
  setCloseWatchdog,
  setForceQuit,
  WINDOW_CLOSE_WATCHDOG_MS,
} from './quitState'

function isVisibleOnAnyDisplay(bounds: WindowBounds): boolean {
  return screen.getAllDisplays().some((d) => {
    const { x, y, width, height } = d.workArea
    return (
      bounds.x + bounds.width > x + 100 &&
      bounds.x < x + width - 100 &&
      bounds.y + bounds.height > y + 100 &&
      bounds.y < y + height - 100
    )
  })
}

function trackWindowState(
  win: BrowserWindow,
  loadBounds: () => WindowBounds | undefined,
  saveBounds: (bounds: WindowBounds) => void,
): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const writeBounds = (): void => {
    if (win.isDestroyed()) return
    const isMaximized = win.isMaximized()
    const bounds = isMaximized ? (loadBounds() ?? win.getBounds()) : win.getBounds()
    saveBounds({ ...bounds, isMaximized })
  }

  const persist = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(writeBounds, 300)
  }

  win.on('resize', persist)
  win.on('move', persist)
  win.on('maximize', persist)
  win.on('unmaximize', persist)
  // Write synchronously on close. Going through `persist` cancelled whatever
  // resize/move was still pending and re-scheduled it 300 ms past the point
  // where `win.isDestroyed()` becomes true, so moving or resizing a window and
  // closing it straight away lost the new geometry. For the Rendering window,
  // which has no confirm funnel to delay its teardown, that was every close.
  win.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    writeBounds()
  })
}

/**
 * Confirm funnel for window close. The first 'close' for a window
 * preventDefaults and asks the renderer to walk every tab through its
 * close-confirm flow (see quitState.ts). When the renderer replies via
 * IPC.WINDOW_CLOSE_PROCEED the window is marked confirmed and re-closed,
 * and this funnel lets the second 'close' through. The red-button and
 * Cmd+Q (which calls win.close() per window) both reach this funnel.
 */
function handleWindowClose(win: BrowserWindow, event: Electron.Event): void {
  if (isCloseConfirmed(win)) return
  event.preventDefault()
  // A confirm request is already being processed -- ignore the extra
  // close (e.g. red-button mashing, or Cmd+Q on top of a red-button).
  if (isCloseInFlight(win)) return
  setCloseInFlight(win, true)
  win.webContents.send(IPC.WINDOW_CLOSE_REQUEST)
  armCloseWatchdog(win)
}

/** Windows whose renderer Chromium currently reports as unresponsive. */
const unresponsiveWindows = new WeakSet<BrowserWindow>()

/** Record Chromium's responsiveness verdict for `win`. */
export function setRendererUnresponsive(win: BrowserWindow, value: boolean): void {
  if (value) unresponsiveWindows.add(win)
  else unresponsiveWindows.delete(win)
}

/**
 * Whether the renderer is provably not running JavaScript right now.
 *
 * This -- not a stopwatch -- is what "the renderer cannot answer" means.
 */
function rendererCannotAnswer(win: BrowserWindow): boolean {
  if (win.webContents.isDestroyed()) return true
  if (win.webContents.isCrashed()) return true
  return unresponsiveWindows.has(win)
}

/**
 * (Re-)start the WINDOW_CLOSE_REQUEST watchdog for `win`.
 *
 * The watchdog exists so the user is never trapped by a renderer that cannot
 * answer the close request. It must never fire because the renderer is *busy*
 * or because the *user* is taking their time -- forcing the window shut then
 * discards the unsaved scenes the confirm chain was asking about, which is the
 * exact opposite of what the chain is for.
 *
 * A timeout alone cannot tell those apart, so the timeout is only a polling
 * interval here. When it elapses the window is closed only if the renderer is
 * provably not running JavaScript (crashed, or reported unresponsive by
 * Chromium). Otherwise:
 *
 *   - a modal is on screen -- the chain is waiting on a person. Main already
 *     knows this: the renderer reports every dialog through
 *     IPC.MENU_SET_MODAL_BLOCKED, and native dialogs go through
 *     withMenuBlocked('native'). Wait.
 *   - no modal, renderer alive -- it is working (a large scene write can take
 *     a while). Wait.
 *
 * A renderer that is alive but whose chain has stalled on a logic bug is
 * therefore never force-closed. That is deliberate: it cannot be told apart
 * from slow work, its own re-entrancy guard means clearing the in-flight flag
 * would not let the user retry anyway, and quitting on a guess costs the user
 * their unsaved scenes. A crash still exits through 'render-process-gone'.
 */
export function armCloseWatchdog(win: BrowserWindow): void {
  clearCloseWatchdog(win)
  const timer = setTimeout(() => {
    if (win.isDestroyed()) return
    if (!isCloseInFlight(win)) return

    if (!rendererCannotAnswer(win)) {
      // Alive. Either a dialog is up or the chain is still working; keep
      // waiting rather than throwing away what it is trying to save.
      if (!isBlocked()) {
        console.warn(
          '[Main] no WINDOW_CLOSE_PROCEED after',
          WINDOW_CLOSE_WATCHDOG_MS,
          'ms, but the renderer is responsive; still waiting',
        )
      }
      armCloseWatchdog(win)
      return
    }

    console.error(
      '[Main] renderer cannot answer WINDOW_CLOSE_REQUEST (crashed or unresponsive); forcing close',
    )
    setCloseInFlight(win, false)
    setCloseConfirmed(win, true)
    win.close()
  }, WINDOW_CLOSE_WATCHDOG_MS)
  setCloseWatchdog(win, timer)
}

const isMac = process.platform === 'darwin'

// --- Main window ---

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
    backgroundColor: '#1e2028',
    // Window / taskbar icon for an unpackaged run on Windows and Linux
    // (undefined once packaged, and ignored on macOS -- see appIcon.ts).
    ...(getDevIconPath() ? { icon: getDevIconPath() } : {}),
    // macOS: let a click on this window while it is inactive activate it AND
    // hit the clicked control in the same click (the default requires a separate
    // activating click first). Matters because the modeless Rendering window
    // floats above this one (it is a child window), so the main window is often
    // clicked while inactive. Ignored on other platforms.
    acceptFirstMouse: true,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 12, y: 12 },
        }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: '#1e2028',
            symbolColor: '#cccccc',
            height: 30,
          },
          autoHideMenuBar: true,
        }),
    webPreferences: {
      nodeIntegration: false,
      nodeIntegrationInWorker: true,
      contextIsolation: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  mainWindow = win

  if (!isMac) {
    win.setMenuBarVisibility(false)
  }

  if (saved?.isMaximized) {
    win.maximize()
  }

  win.on('ready-to-show', () => {
    win.show()
    win.focus()
  })

  // Forward renderer/worker console messages to stdout/stderr. In a packaged
  // app stdout is not attached to a terminal, so info/log level messages are
  // dropped here: formatting and writing them costs main-process time for
  // output nobody sees. warn/error are always kept for crash diagnosis.
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level < 2 && app.isPackaged) return
    const src = sourceId ? ` (${sourceId}:${line})` : ''
    if (level === 3) {
      console.error('[Renderer]', message + src)
    } else if (level === 2) {
      console.warn('[Renderer]', message + src)
    } else {
      console.log('[Renderer]', message + src)
    }
  })

  // Renderer process crashed (segfault, OOM, or process.crash). The
  // confirm funnel cannot complete because the renderer is dead -- mark
  // every closure path satisfied and exit immediately.
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(
      '[Main] render-process-gone:',
      details.reason,
      'exitCode=' + details.exitCode,
    )
    clearCloseWatchdog(win)
    setCloseConfirmed(win, true)
    setForceQuit(true)
    setAppQuitting(true)
    app.exit(1)
  })

  // A reload discards the React tree, and with it every component that owed a
  // menu-unblock. The 'blueprint' block count is incremented when a dialog
  // mounts and decremented when it unmounts, both from the renderer, so a
  // reload with a dialog open left the count stuck above zero and every menu
  // item except the text-edit ones disabled for the rest of the run -- Cmd+Q
  // included, with no way to recover. Main sees the navigation, so it clears
  // the reason here.
  win.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) resetMenuBlockReason('blueprint')
  })

  // Renderer is hung (e.g. infinite loop in JS or blocked on a sync call).
  // Logged but not auto-killed -- transient stalls are common during heavy
  // work and false-positive force-quits would be worse than the symptom.
  win.webContents.on('unresponsive', () => {
    console.error('[Main] renderer unresponsive')
    setRendererUnresponsive(win, true)
  })
  win.webContents.on('responsive', () => {
    console.log('[Main] renderer responsive again')
    setRendererUnresponsive(win, false)
  })

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

  // The Rendering window is no longer a child of the main window (see
  // createOrFocusRenderWindow), so it does not auto-close with it. Close it
  // here so all windows are gone -> 'window-all-closed' fires -> the app quits.
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
    if (renderWindow && !renderWindow.isDestroyed()) renderWindow.close()
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

// --- Rendering window (modeless child) ---

let renderWindow: BrowserWindow | null = null

/** The Rendering window, or null when it is not open. */
export function getRenderWindow(): BrowserWindow | null {
  return renderWindow
}

/**
 * Open the modeless Rendering window, or focus it if already open.
 *
 * The window is a child of the main window (`parent`) so it always stays
 * above it. It hosts no CueMol worker -- all render execution is relayed
 * to the main window over IPC (see renderWindowIpc.ts). Closing it is a
 * real close; it is recreated on demand and re-syncs its state from the
 * main window's bridge via the 'sync' command.
 */
export function createOrFocusRenderWindow(mainWindow: BrowserWindow): void {
  if (renderWindow && !renderWindow.isDestroyed()) {
    renderWindow.show()
    renderWindow.focus()
    return
  }

  const saved = loadRenderWindowBounds()
  const boundsOnScreen = saved ? isVisibleOnAnyDisplay(saved) : false

  // Saved geometry, or first-run default centered over the main window.
  const parentBounds = mainWindow.getBounds()
  const width = boundsOnScreen ? saved!.width : 1000
  const height = boundsOnScreen ? saved!.height : 760
  let x = boundsOnScreen
    ? saved!.x
    : Math.round(parentBounds.x + (parentBounds.width - width) / 2)
  let y = boundsOnScreen
    ? saved!.y
    : Math.round(parentBounds.y + (parentBounds.height - height) / 2)

  // Keep the title bar grippable: clamp into the target display's work
  // area (on macOS y=0 would put the title bar under the menu bar).
  const workArea = screen.getDisplayMatching({ x, y, width, height }).workArea
  x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - Math.min(width, 300))
  y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - 100)

  const win = new BrowserWindow({
    // Intentionally NOT a `parent: mainWindow` child window: on macOS/Windows a
    // child window is pinned above its parent, which blocks operating the main
    // window underneath. As an independent top-level window the normal z-order
    // applies (clicking the main window brings it to front). The main window's
    // 'closed' handler closes this one so the app can still quit (see below).
    width,
    height,
    x,
    y,
    minWidth: 480,
    minHeight: 480,
    title: 'Rendering',
    backgroundColor: '#1e2028',
    // Same dev-run icon as the main window (see createWindow).
    ...(getDevIconPath() ? { icon: getDevIconPath() } : {}),
    // Single-click activate-and-act on macOS (see createWindow). Symmetric, so
    // whichever window is inactive can still be operated in one click.
    acceptFirstMouse: true,
    // Same custom title-bar chrome as the main window; the in-window drag
    // strip is RenderWindowApp's .render-window-titlebar.
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 12, y: 12 },
        }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: '#1e2028',
            symbolColor: '#cccccc',
            height: 30,
          },
          autoHideMenuBar: true,
        }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  })
  renderWindow = win

  if (!isMac) {
    win.setMenuBarVisibility(false)
  }

  win.on('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })

  // Adopt the main window's UI zoom. Zoom level is per-webContents and resets
  // on load, so it is applied after the page is up rather than at creation;
  // without it a zoomed main window and a 100% Rendering window draw the same
  // header and tab strip at two different sizes.
  win.webContents.on('did-finish-load', () => {
    if (win.isDestroyed() || mainWindow.isDestroyed()) return
    win.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel())
  })

  // Forward console messages like the main window (same packaged-build level
  // filter), tagged for telling apart.
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level < 2 && app.isPackaged) return
    const src = sourceId ? ` (${sourceId}:${line})` : ''
    if (level === 3) {
      console.error('[RenderWin]', message + src)
    } else if (level === 2) {
      console.warn('[RenderWin]', message + src)
    } else {
      console.log('[RenderWin]', message + src)
    }
  })

  // A crash in this satellite window must not take down the app (the main
  // window's handler does app.exit(1); here we only drop the window).
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(
      '[Main] render window render-process-gone:',
      details.reason,
      'exitCode=' + details.exitCode,
    )
    if (!win.isDestroyed()) win.destroy()
  })

  win.on('closed', () => {
    if (renderWindow === win) renderWindow = null
  })

  trackWindowState(win, loadRenderWindowBounds, saveRenderWindowBounds)
  registerTextContextMenu(win)
  // No createMenu (it would rebind the app menu's window ref) and no
  // handleWindowClose funnel (tab close-confirm is main-window-only).

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/render.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/render.html'))
  }
}
