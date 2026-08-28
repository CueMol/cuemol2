import { app, BrowserWindow, nativeTheme, session } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { createWindow, focusMainWindow, getMainWindow } from './windowManager'
import { parseFileArgs, resolveShellPaths, type ParsedFileArgs } from './helpers/parseFileArgs'
import { enqueueShellOpen } from './shellOpenQueue'
import { IPC } from '@shared/ipcChannels'
import { applyDevDockIcon } from './helpers/appIcon'
import { loadUi } from './stateStore'
import { isAppQuitting, isForceQuit, setAppQuitting } from './quitState'
import { clearRenderHistory } from './renderHistory'
import { sweepMovieOutputs } from './movieOutput'
import { APP_PRODUCT_NAME } from '@shared/appInfo'
import { installMainCrashHandlers } from './installMainCrashHandlers'

// Before anything else, so a throw during the setup below is still reported
// to the terminal and a closed stdout pipe cannot masquerade as a crash.
installMainCrashHandlers()

app.setName(APP_PRODUCT_NAME)

// Dev-only clean-profile launch: when CUEMOL_FRESH_PREFS is set, point userData
// at a throwaway dir (wiped first) so no previously persisted preference
// (electron-store app-state.json) or localStorage carries over. The real user
// profile is untouched. Gated by env so a packaged/production run never trips
// it. Must run before the app is ready -- ahead of any electron-store / session
// access -- for the new path to take effect.
if (process.env.CUEMOL_FRESH_PREFS && process.env.CUEMOL_FRESH_PREFS !== '0') {
  const freshDir = path.join(os.tmpdir(), 'cuemol-dev-userdata')
  try {
    fs.rmSync(freshDir, { recursive: true, force: true })
  } catch {
    // First run (dir absent) or a transient FS error -- a fresh dir is created below.
  }
  app.setPath('userData', freshDir)
  console.log('[Main] CUEMOL_FRESH_PREFS set -- clean profile at ' + freshDir)
}

// --- Single instance + OS shell file open (UXP openFromShell parity) ---

// Placed after the CUEMOL_FRESH_PREFS override above: the lock lives under
// userData, so a fresh-prefs dev run deliberately gets its own lock domain and
// can run alongside a normal one.
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  // requestSingleInstanceLock() has already handed our argv and cwd to the
  // primary instance, which opens the files. Every side effect below is gated
  // on this flag rather than relying on app.quit() winning the race: quit is
  // asynchronous, whenReady() can still resolve, and will-quit's
  // clearRenderHistory() would wipe the RUNNING instance's history (the
  // history directory is a fixed path under os.tmpdir()).
  console.log('[Main] another instance owns the single-instance lock; exiting')
  app.quit()
}

/**
 * Queue a shell-open batch and wake the renderer.
 *
 * The paths themselves always travel by pull (see main/shellOpenQueue.ts); the
 * push only says "there is something to take", so a request queued before the
 * window exists is picked up by the renderer's startup pull.
 */
function acceptShellOpen(req: ParsedFileArgs): void {
  if (req.paths.length === 0 && req.missing.length === 0) return
  enqueueShellOpen(req)
  // Main window only -- the Rendering window has no CueMol worker.
  const win = getMainWindow()
  if (win) win.webContents.send(IPC.SHELL_FILES_PENDING)
}

// macOS delivers a Finder double-click, "Open With", a Dock-tile drop and a
// Dock recent-document click as an 'open-file' Apple Event -- never in argv.
// It can fire before 'ready', so the listener is registered here at module
// scope. Without preventDefault() Electron warns and the path is lost. A
// multi-file open produces one event per file.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (!gotSingleInstanceLock) return
  acceptShellOpen(resolveShellPaths([filePath], process.cwd()))
})

if (gotSingleInstanceLock) {
  // A second launch hands its command line here instead of starting another
  // app. UXP cuemol2-cmdline.js parity: raise the running window and open into
  // it, never create a second one.
  app.on('second-instance', (_event, argv, workingDirectory) => {
    focusMainWindow()
    // Pull the app forward from whichever app the user launched us from.
    if (process.platform === 'darwin') app.focus({ steal: true })
    acceptShellOpen(
      parseFileArgs({ argv, isPackaged: app.isPackaged, cwd: workingDirectory }),
    )
  })

  // Command-line file arguments. Read at module scope: the queue tolerates
  // being filled before any window exists.
  acceptShellOpen(
    parseFileArgs({ argv: process.argv, isPackaged: app.isPackaged, cwd: process.cwd() }),
  )
}

// An OS file dropped outside the renderer's drop handler (or before React
// mounts, or onto the Rendering window) must never navigate an app window
// to file:// -- that would replace the UI with the file's contents.
// loadFile/loadURL don't fire will-navigate, and reload keeps the same URL,
// so both stay unaffected.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (url !== contents.getURL()) event.preventDefault()
  })
})

app.whenReady().then(() => {
  // app.quit() above is asynchronous, so this can still run in the instance
  // that lost the lock. It must not create a window or touch shared state.
  if (!gotSingleInstanceLock) return

  // Dev runs have no .app bundle to take the dock icon from (see appIcon.ts).
  applyDevDockIcon()

  // Drop any render-history images a previous run left behind (its metadata
  // died with that run, so the files are unreachable).
  clearRenderHistory()

  // Age out past runs' movie output. Unlike the render history this is not
  // wiped wholesale: a movie can represent hours of rendering, so only stale
  // frames and long-past sessions go (see movieOutput.ts / ADR-0043).
  sweepMovieOutputs()

  // Align the native window chrome with the persisted UI theme. Without
  // this, macOS keeps the system appearance for its window frame and draws
  // a light 1px titlebar hairline across the top of dark hidden-titlebar
  // windows. Kept in sync on theme changes by the UI_SAVE handler.
  nativeTheme.themeSource = loadUi().theme ?? 'dark'

  // Enable the Local Font Access API (`window.queryLocalFonts()`), used by the
  // settings font picker to list installed system fonts. Without a handler
  // Electron's default is to grant permission requests; we set an explicit
  // pass-through so `local-fonts` is granted deterministically. This is a local,
  // trusted app that loads only bundled content and requests no other web
  // permissions, so an allow-all handler preserves the existing default.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(true))
  session.defaultSession.setPermissionCheckHandler(() => true)

  createWindow()
})

// The render history is per-run: its images are temp files and the settings
// that produced them are not persisted either.
app.on('will-quit', () => {
  // Guarded: the history directory is a fixed path under os.tmpdir(), shared by
  // every instance. Without this, an instance that loses the single-instance
  // lock and quits would wipe the running instance's render history.
  if (!gotSingleInstanceLock) return
  clearRenderHistory()
})

app.on('window-all-closed', () => {
  // Single-window app: closing the window quits on every OS, so no
  // window-less zombie process is left behind.
  // FUTURE (multi-window): on macOS keep the app alive in the Dock when
  // the user closes the last window without quitting --
  //   if (process.platform === 'darwin' && !isAppQuitting()) return
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Quit lifecycle (UXP parity: confirm modified scenes before shutdown).
// Cmd+Q / role:quit fires 'before-quit'. Rather than confirming here, we
// route every window through its own win.on('close') confirm funnel; the
// app terminates once all windows have closed (window-all-closed ->
// app.quit() -> this listener re-enters with isAppQuitting() true).
app.on('before-quit', (event) => {
  // Force-quit path (crash listener, fallback UI Quit button, watchdog):
  // skip the confirm funnel entirely.
  if (isForceQuit()) return
  if (isAppQuitting()) return
  // Close the main window only. It is the one with a confirm funnel, and its
  // 'closed' handler takes the Rendering window down with it. Closing every
  // window here destroyed the Rendering window first -- it has no funnel -- so
  // cancelling the main window's save prompt restored the app minus its render
  // history view and any in-flight settings.
  const main = getMainWindow()
  if (!main || main.isDestroyed()) return
  setAppQuitting(true)
  event.preventDefault()
  main.close()
})

// Utility/GPU process crashes (Web Workers run inside the renderer process
// and therefore surface in `render-process-gone` instead, but this is the
// catch-all for everything else Chromium spawns).
app.on('child-process-gone', (_event, details) => {
  console.error(
    '[Main] child-process-gone: type=' + details.type,
    'reason=' + details.reason,
    'exitCode=' + details.exitCode,
  )
})
