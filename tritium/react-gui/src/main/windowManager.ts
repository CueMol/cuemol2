/**
 * BrowserWindow creation and lifecycle management.
 */

import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { loadWindowBounds, saveWindowBounds, type WindowBounds } from './stateStore'
import { registerIpcHandlers } from './ipcHandlers'
import { createMenu } from './menu'
import { IPC } from '../shared/ipcChannels'

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
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      nodeIntegration: false,
      nodeIntegrationInWorker: true,
      contextIsolation: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  })

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

  trackWindowState(win)
  registerIpcHandlers(win)
  createMenu(win)

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
