/**
 * IPC relay between the main window (which owns the CueMol worker) and the
 * modeless Rendering window (pure UI, no worker).
 *
 * Legs (see shared/ipcChannels.ts):
 *   render window --invoke RENDER_WINDOW_COMMAND--> main --push RENDER_WINDOW_EXEC--> main window
 *   main window  --invoke RENDER_WINDOW_STATE----> main --push RENDER_WINDOW_STATE_PUSH--> render window
 *
 * State forwards are dropped silently while the render window is closed;
 * the window re-syncs on mount by sending a 'sync' command, which is the
 * single rehydration path (avoids ordering bugs from partial replays).
 *
 * The "Current view" size preset needs the main window's live canvas size,
 * so RENDER_VIEW_SIZE_GET does a correlation-id round trip to the main
 * window with a timeout fallback.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipcChannels'
import type { ViewSizePx } from '../shared/ipcTypes'
import { movieFrameFileName } from '../shared/movieFrames'
import { handleInvoke } from './ipcHandlers'

/** How long to wait for the main window's view-size reply. */
const VIEW_SIZE_TIMEOUT_MS = 2000

export interface RenderWindowIpcDeps {
  mainWindow: BrowserWindow
  getRenderWindow: () => BrowserWindow | null
  openRenderWindow: () => void
}

/**
 * Register the render-window relay handlers. Called once from
 * createWindow(); handlers survive render-window close/recreate because
 * they only hold the getter.
 */
export function registerRenderWindowIpc(deps: RenderWindowIpcDeps): void {
  const { mainWindow, getRenderWindow, openRenderWindow } = deps

  handleInvoke(IPC.RENDER_WINDOW_OPEN, () => {
    openRenderWindow()
  })

  // Render window -> main window (command forward)
  handleInvoke(IPC.RENDER_WINDOW_COMMAND, (_event, cmd) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.RENDER_WINDOW_EXEC, cmd)
    }
  })

  // Main window -> render window (state forward; silent drop when closed)
  handleInvoke(IPC.RENDER_WINDOW_STATE, (_event, update) => {
    const rw = getRenderWindow()
    if (rw && !rw.isDestroyed()) {
      rw.webContents.send(IPC.RENDER_WINDOW_STATE_PUSH, update)
    }
  })

  // --- "Current view" size round trip ---

  let nextReqId = 1
  const pending = new Map<number, (size: ViewSizePx | null) => void>()

  handleInvoke(IPC.RENDER_VIEW_SIZE_GET, () => {
    if (mainWindow.isDestroyed()) return Promise.resolve(null)
    const reqId = nextReqId++
    return new Promise<ViewSizePx | null>((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(reqId)
        resolve(null)
      }, VIEW_SIZE_TIMEOUT_MS)
      pending.set(reqId, (size) => {
        clearTimeout(timer)
        pending.delete(reqId)
        resolve(size)
      })
      mainWindow.webContents.send(IPC.RENDER_VIEW_SIZE_REQUEST, { reqId })
    })
  })

  handleInvoke(IPC.RENDER_VIEW_SIZE_REPLY, (_event, { reqId, size }) => {
    pending.get(reqId)?.(size)
  })

  // Frame slider: read one already-rendered frame straight off disk. The
  // frames are plain files in the user's output folder, so this needs
  // neither the worker nor the main window -- unlike the view-size round
  // trip above, it is a single hop.
  handleInvoke(IPC.RENDER_FRAME_READ, (_event, { outputDir, baseName, frameIndex }) => {
    try {
      const file = path.join(outputDir, movieFrameFileName(baseName, frameIndex))
      const buf = fs.readFileSync(file)
      return { dataUrl: `data:image/png;base64,${buf.toString('base64')}` }
    } catch {
      // Frame deleted or moved since the render finished.
      return { dataUrl: null }
    }
  })
}
