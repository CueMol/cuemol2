/**
 * BrowserWindow creation and lifecycle management.
 */

import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { loadWindowBounds, saveWindowBounds, type WindowBounds } from './stateStore'
import { registerIpcHandlers } from './ipcHandlers'
import { createMenu } from './menu'
import { registerTextContextMenu } from './textContextMenu'
import { IPC } from '../shared/ipcChannels'
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

function trackWindowState(win: BrowserWindow): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const persist = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!win.isDestroyed()) {
        const isMaximized = win.isMaximized()
        const bounds = isMaximized ? (loadWindowBounds() ?? win.getBounds()) : win.getBounds()
        saveWindowBounds({ ...bounds, isMaximized })
      }
    }, 300)
  }

  win.on('resize', persist)
  win.on('move', persist)
  win.on('maximize', persist)
  win.on('unmaximize', persist)
  win.on('close', persist)
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

  // Watchdog: if the renderer never replies (crashed or wedged), force the
  // window closed so the user is not stuck unable to quit. Cleared on
  // WINDOW_CLOSE_PROCEED via `clearCloseWatchdog`.
  const timer = setTimeout(() => {
    if (win.isDestroyed()) return
    if (!isCloseInFlight(win)) return
    console.error(
      '[Main] WINDOW_CLOSE_REQUEST watchdog fired after',
      WINDOW_CLOSE_WATCHDOG_MS,
      'ms; forcing close',
    )
    setCloseInFlight(win, false)
    setCloseConfirmed(win, true)
    win.close()
  }, WINDOW_CLOSE_WATCHDOG_MS)
  setCloseWatchdog(win, timer)
}

const isMac = process.platform === 'darwin'

export function createWindow(): void {
  const saved = loadWindowBounds()
  const boundsOnScreen = saved ? isVisibleOnAnyDisplay(saved) : false

  const win = new BrowserWindow({
    width: boundsOnScreen ? saved!.width : 1400,
    height: boundsOnScreen ? saved!.height : 900,
    ...(boundsOnScreen ? { x: saved!.x, y: saved!.y } : {}),
    minWidth: 800,
    minHeight: 600,
    title: 'CueMol',
    backgroundColor: '#1e2028',
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

  // Forward renderer/worker console messages to stdout/stderr
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
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

  // Renderer is hung (e.g. infinite loop in JS or blocked on a sync call).
  // Logged but not auto-killed -- transient stalls are common during heavy
  // work and false-positive force-quits would be worse than the symptom.
  win.webContents.on('unresponsive', () => {
    console.error('[Main] renderer unresponsive')
  })
  win.webContents.on('responsive', () => {
    console.log('[Main] renderer responsive again')
  })

  trackWindowState(win)
  registerTextContextMenu(win)
  registerIpcHandlers(win)
  createMenu(win)

  // Close confirm funnel (separate from trackWindowState's bounds-saving
  // 'close' listener; both listeners fire on close).
  win.on('close', (event) => handleWindowClose(win, event))

  // macOS trackpad 2-finger rotate gesture: Chromium does not emit a DOM
  // event for this, so we capture it here and push it to the renderer via IPC.
  // On non-macOS this event never fires but attaching is harmless.
  win.on('rotate-gesture', (_event, rotation) => {
    win.webContents.send(IPC.ROTATE_GESTURE, rotation)
  })

  // TEMP spike (remove after verification): confirm Electron's input-event
  // exposes hasPreciseScrollingDeltas so a trackpad (true) can be told apart
  // from a physical mouse wheel (false). Logs to the main-process console.
  win.webContents.on('input-event', (_event, input) => {
    if (input.type === 'mouseWheel') {
      const w = input as Electron.MouseWheelInputEvent
      console.log(
        `[input-spike] mouseWheel precise=${w.hasPreciseScrollingDeltas} ` +
          `deltaY=${w.deltaY} ticksY=${w.wheelTicksY} accelY=${w.accelerationRatioY}`,
      )
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'undocked' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
