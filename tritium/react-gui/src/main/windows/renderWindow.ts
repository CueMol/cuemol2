/**
 * @file main/windows/renderWindow.ts
 * @description The modeless Rendering window.
 */

import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import {
  loadRenderWindowBounds,
  saveRenderWindowBounds,
} from '../stateStore'
import { registerTextContextMenu } from '../textContextMenu'
import { chromeWindowOptions, forwardConsoleMessages, hideMenuBar } from './windowChrome'
import { isVisibleOnAnyDisplay, trackWindowState } from './windowState'
import { holdUntilRevealed } from './reveal'

let renderWindow: BrowserWindow | null = null

/** The Rendering window, or null when it is not open. */
export function getRenderWindow(): BrowserWindow | null {
  return renderWindow
}

/** First-run size, used when there is no saved geometry to restore. */
const DEFAULT_SIZE = { width: 1000, height: 760 }

/**
 * Where to open: saved geometry when it still lands on a display, otherwise
 * centered over the main window.
 *
 * The result is clamped into the target display's work area so the title bar
 * stays grippable -- centering over a main window near the top of the screen
 * would otherwise put it under the macOS menu bar.
 */
function placeWindow(parent: BrowserWindow): {
  x: number; y: number; width: number; height: number
} {
  const saved = loadRenderWindowBounds()
  const onScreen = saved ? isVisibleOnAnyDisplay(saved) : false
  const parentBounds = parent.getBounds()
  const width = onScreen ? saved!.width : DEFAULT_SIZE.width
  const height = onScreen ? saved!.height : DEFAULT_SIZE.height
  let x = onScreen
    ? saved!.x
    : Math.round(parentBounds.x + (parentBounds.width - width) / 2)
  let y = onScreen
    ? saved!.y
    : Math.round(parentBounds.y + (parentBounds.height - height) / 2)

  const workArea = screen.getDisplayMatching({ x, y, width, height }).workArea
  x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - Math.min(width, 300))
  y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - 100)
  return { x, y, width, height }
}

/**
 * Open the modeless Rendering window, or focus it if already open.
 *
 * It hosts no CueMol worker -- all render execution is relayed to the main
 * window over IPC (see renderWindowIpc.ts). Closing it is a real close; it is
 * recreated on demand and re-syncs its state from the main window's bridge
 * via the 'sync' command.
 */
export function createOrFocusRenderWindow(mainWindow: BrowserWindow): void {
  if (renderWindow && !renderWindow.isDestroyed()) {
    renderWindow.show()
    renderWindow.focus()
    return
  }

  const win = new BrowserWindow({
    // Intentionally NOT a `parent: mainWindow` child window: on macOS/Windows a
    // child window is pinned above its parent, which blocks operating the main
    // window underneath. As an independent top-level window the normal z-order
    // applies (clicking the main window brings it to front). The main window's
    // 'closed' handler closes this one so the app can still quit.
    ...placeWindow(mainWindow),
    minWidth: 480,
    minHeight: 480,
    title: 'Rendering',
    // The in-window drag strip is RenderWindowApp's .render-window-titlebar.
    ...chromeWindowOptions(),
  })
  renderWindow = win

  hideMenuBar(win)

  // Shown when its page reports the first frame with the main window's
  // answers in it (reveal.ts), not on Electron's first-paint event, which for
  // this page is an empty root element.
  holdUntilRevealed(win, () => win.show())

  // Adopt the main window's UI zoom. Zoom level is per-webContents and resets
  // on load, so it is applied after the page is up rather than at creation;
  // without it a zoomed main window and a 100% Rendering window draw the same
  // header and tab strip at two different sizes.
  win.webContents.on('did-finish-load', () => {
    if (win.isDestroyed() || mainWindow.isDestroyed()) return
    win.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel())
  })

  forwardConsoleMessages(win, '[RenderWin]')

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
  // close funnel (tab close-confirm is main-window-only).

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/render.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/render.html'))
  }
}
