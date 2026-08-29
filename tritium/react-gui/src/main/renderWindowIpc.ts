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
import { clipboard, dialog, nativeImage, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { RenderImageRef, RenderViewCamera, HatchStyleSpecReply, RenderWindowMode, ViewSizePx } from '@shared/types/renderWindow'
import {
  frameFileRegExp,
  movieFileNames,
  movieFrameFileName,
  resolveMovieBaseName,
} from '@shared/movieFrames'
import { getSessionMovieDir } from './movieOutput'
import {
  clearRenderHistory,
  readRenderImage,
  registerRenderWorkDir,
  renderImagePath,
  storeRenderImage,
} from './renderHistory'
import { handleInvoke } from './ipcHandlers'
import { withMenuBlocked } from './menu'

/** How long to wait for a main-window reply (view size / view camera). */
const VIEW_SIZE_TIMEOUT_MS = 2000

export interface RenderWindowIpcDeps {
  mainWindow: BrowserWindow
  getRenderWindow: () => BrowserWindow | null
  openRenderWindow: () => void
}

/**
 * Deliver a requested output mode to the render window.
 *
 * A freshly created window cannot receive it yet -- its React tree subscribes
 * during mount -- so the request is held until the window announces itself
 * with the 'sync' command, which is the same handshake the state relay uses
 * for rehydration. An already-open window is subscribed, so it is pushed
 * straight away.
 */
function makeModeRelay(getRenderWindow: () => BrowserWindow | null) {
  let pending: RenderWindowMode | null = null
  let seq = 0

  const send = (rw: BrowserWindow, mode: RenderWindowMode): void => {
    seq += 1
    rw.webContents.send(IPC.RENDER_WINDOW_MODE_PUSH, { mode, seq })
  }

  return {
    /** Called on RENDER_WINDOW_OPEN, before the window is opened / focused. */
    request(mode: RenderWindowMode | undefined, wasOpen: boolean): void {
      if (!mode) return
      const rw = getRenderWindow()
      if (wasOpen && rw && !rw.isDestroyed()) send(rw, mode)
      else pending = mode
    },
    /** Called when the render window sends its mount-time 'sync'. */
    flush(): void {
      if (pending === null) return
      const rw = getRenderWindow()
      const mode = pending
      pending = null
      if (rw && !rw.isDestroyed()) send(rw, mode)
    },
  }
}

/**
 * Register the render-window relay handlers. Called once from
 * createWindow(); handlers survive render-window close/recreate because
 * they only hold the getter.
 */
export function registerRenderWindowIpc(deps: RenderWindowIpcDeps): void {
  const { mainWindow, getRenderWindow, openRenderWindow } = deps

  const modeRelay = makeModeRelay(getRenderWindow)

  handleInvoke(IPC.RENDER_WINDOW_OPEN, (_event, opts) => {
    const rw = getRenderWindow()
    modeRelay.request(opts?.mode, rw !== null && !rw.isDestroyed())
    openRenderWindow()
  })

  // Render window -> main window (command forward)
  handleInvoke(IPC.RENDER_WINDOW_COMMAND, (_event, cmd) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.RENDER_WINDOW_EXEC, cmd)
    }
    // The mount-time 'sync' is the render window announcing it is subscribed:
    // a mode requested while it was still loading can be delivered now.
    if (cmd.type === 'sync') modeRelay.flush()
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

  // --- Target-view camera round trip ---
  //
  // Same shape as the size trip above: the view lives in the main window's
  // worker, so the render window cannot read it directly. Used to default the
  // Camera settings to what the selected target view currently shows.

  let nextCamReqId = 1
  const pendingCam = new Map<number, (camera: RenderViewCamera | null) => void>()

  handleInvoke(IPC.RENDER_VIEW_CAMERA_GET, (_event, { viewId }) => {
    if (mainWindow.isDestroyed()) return Promise.resolve(null)
    const reqId = nextCamReqId++
    return new Promise<RenderViewCamera | null>((resolve) => {
      const timer = setTimeout(() => {
        pendingCam.delete(reqId)
        resolve(null)
      }, VIEW_SIZE_TIMEOUT_MS)
      pendingCam.set(reqId, (camera) => {
        clearTimeout(timer)
        pendingCam.delete(reqId)
        resolve(camera)
      })
      mainWindow.webContents.send(IPC.RENDER_VIEW_CAMERA_REQUEST, { reqId, viewId })
    })
  })

  handleInvoke(IPC.RENDER_VIEW_CAMERA_REPLY, (_event, { reqId, camera }) => {
    pendingCam.get(reqId)?.(camera)
  })

  // --- Hatch style template round trip ---
  //
  // Same shape again: the NPR layer editor loads the selected hatch style as
  // spec text, which only the main window's worker (the C++ side) can
  // resolve. A timeout reads as a failed load, not as an empty style.

  let nextHatchReqId = 1
  const pendingHatch = new Map<number, (result: HatchStyleSpecReply) => void>()

  handleInvoke(IPC.RENDER_HATCH_STYLE_GET, (_event, { style }) => {
    const unavailable: HatchStyleSpecReply = { ok: false, error: 'main window unavailable' }
    if (mainWindow.isDestroyed()) return Promise.resolve(unavailable)
    const reqId = nextHatchReqId++
    return new Promise<HatchStyleSpecReply>((resolve) => {
      const timer = setTimeout(() => {
        pendingHatch.delete(reqId)
        resolve({ ok: false, error: 'timeout' })
      }, VIEW_SIZE_TIMEOUT_MS)
      pendingHatch.set(reqId, (result) => {
        clearTimeout(timer)
        pendingHatch.delete(reqId)
        resolve(result)
      })
      mainWindow.webContents.send(IPC.RENDER_HATCH_STYLE_REQUEST, { reqId, style })
    })
  })

  handleInvoke(IPC.RENDER_HATCH_STYLE_REPLY, (_event, { reqId, result }) => {
    pendingHatch.get(reqId)?.(result)
  })

  // --- Render history ---
  //
  // Finished renders are archived as files rather than pushed around as data
  // URLs, so the render window holds only the image it is showing.

  handleInvoke(IPC.RENDER_HISTORY_STORE, (_event, { resultId, sourcePath, workDir }) => {
    const ok = storeRenderImage(resultId, sourcePath)
    // Registered only once the copy landed, so a failed archive cannot take
    // the source directory with it.
    if (ok && workDir) registerRenderWorkDir(workDir)
    return { ok }
  })

  handleInvoke(IPC.RENDER_HISTORY_CLEAR, () => {
    clearRenderHistory()
  })

  handleInvoke(IPC.RENDER_HISTORY_READ, (_event, { resultId }) => ({
    dataUrl: readRenderImage(resultId),
  }))

  // --- Exporting the shown render ---
  //
  // Both act on a file: the archived render, or -- while the frame slider is
  // showing one -- that frame in the user's own output folder, so what is
  // exported is always what is on screen.

  const refToPath = (ref: RenderImageRef): string =>
    ref.kind === 'result'
      ? renderImagePath(ref.resultId)
      : path.join(
          ref.outputDir,
          movieFrameFileName(resolveMovieBaseName(ref.baseName), ref.frameIndex),
        )

  handleInvoke(IPC.RENDER_IMAGE_SAVE, async (_event, { ref, defaultName }) => {
    const source = refToPath(ref)
    if (!fs.existsSync(source)) {
      return { canceled: false, error: 'The rendered image is no longer available.' }
    }
    const rw = getRenderWindow()
    const parent = rw && !rw.isDestroyed() ? rw : mainWindow
    // Blocked like every other native dialog (see handlers/fileDialogs.ts):
    // without it the application-menu accelerators -- Cmd+Q, Cmd+W, Cmd+S --
    // still fire while the save sheet is up.
    const picked = await withMenuBlocked('native', () =>
      dialog.showSaveDialog(parent, {
        title: 'Save Rendered Image',
        defaultPath: defaultName,
        filters: [
          { name: 'PNG Image', extensions: ['png'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }),
    )
    if (picked.canceled || !picked.filePath) return { canceled: true }
    try {
      fs.copyFileSync(source, picked.filePath)
      return { canceled: false, filePath: picked.filePath }
    } catch (e) {
      return { canceled: false, filePath: picked.filePath, error: (e as Error).message }
    }
  })

  // Save the encoded movie itself. With the app-managed folder as the default
  // output, this is how a movie leaves the sweep's reach; the frames stay
  // where they are (they are the re-encode input, not a deliverable).
  handleInvoke(IPC.RENDER_MOVIE_SAVE, async (_event, { moviePath, defaultName }) => {
    if (!fs.existsSync(moviePath)) {
      return { canceled: false, error: 'The movie file is no longer available.' }
    }
    const rw = getRenderWindow()
    const parent = rw && !rw.isDestroyed() ? rw : mainWindow
    const ext = path.extname(moviePath).replace(/^\./, '')
    const picked = await withMenuBlocked('native', () =>
      dialog.showSaveDialog(parent, {
        title: 'Save Movie',
        defaultPath: defaultName,
        filters: [
          ...(ext ? [{ name: `${ext.toUpperCase()} Movie`, extensions: [ext] }] : []),
          { name: 'All Files', extensions: ['*'] },
        ],
      }),
    )
    if (picked.canceled || !picked.filePath) return { canceled: true }
    try {
      fs.copyFileSync(moviePath, picked.filePath)
      return { canceled: false, filePath: picked.filePath }
    } catch (e) {
      return { canceled: false, filePath: picked.filePath, error: (e as Error).message }
    }
  })

  handleInvoke(IPC.RENDER_IMAGE_COPY, (_event, { ref }) => {
    const image = nativeImage.createFromPath(refToPath(ref))
    if (image.isEmpty()) {
      return { ok: false, error: 'The rendered image is no longer available.' }
    }
    clipboard.writeImage(image)
    return { ok: true }
  })

  // The default movie output folder: created on first ask and shared by every
  // movie render of this run, so an animation render needs no setup at all.
  handleInvoke(IPC.RENDER_MOVIE_TEMPDIR, () => ({ dir: getSessionMovieDir() }))

  // Frame slider: read one already-rendered frame straight off disk. The
  // frames are plain files in the user's output folder, so this needs
  // neither the worker nor the main window -- unlike the view-size round
  // trip above, it is a single hop.
  handleInvoke(IPC.RENDER_FRAME_READ, (_event, { outputDir, baseName, frameIndex }) => {
    try {
      const file = path.join(
        outputDir,
        movieFrameFileName(resolveMovieBaseName(baseName), frameIndex),
      )
      const buf = fs.readFileSync(file)
      return { dataUrl: `data:image/png;base64,${buf.toString('base64')}` }
    } catch {
      // Frame deleted or moved since the render finished.
      return { dataUrl: null }
    }
  })

  // Re-encode gate: count the contiguous rendered frames on disk, starting at
  // frame 0. A gap means the sequence is incomplete, so counting stops there.
  handleInvoke(IPC.RENDER_FRAMES_CHECK, (_event, { outputDir, baseName }) => {
    if (!outputDir) return { frameCount: 0 }
    const base = resolveMovieBaseName(baseName)
    let n = 0
    for (;;) {
      const file = path.join(outputDir, movieFrameFileName(base, n))
      if (!fs.existsSync(file)) break
      n += 1
    }
    return { frameCount: n }
  })

  // Clean up: delete every rendered frame image (any index) and any encoded
  // movie for this base name in the output folder. Confirmed on the renderer
  // side before this is called.
  handleInvoke(IPC.RENDER_FRAMES_CLEANUP, (_event, { outputDir, baseName }) => {
    if (!outputDir) return { ok: false, deleted: 0 }
    const base = resolveMovieBaseName(baseName)
    const frameRe = frameFileRegExp(base)
    const movieNames = movieFileNames(base)
    let deleted = 0
    try {
      for (const name of fs.readdirSync(outputDir)) {
        if (!frameRe.test(name) && !movieNames.has(name)) continue
        try {
          fs.rmSync(path.join(outputDir, name), { force: true })
          deleted += 1
        } catch {
          /* leave files we cannot remove */
        }
      }
    } catch {
      // Output folder gone.
      return { ok: false, deleted }
    }
    return { ok: true, deleted }
  })
}
