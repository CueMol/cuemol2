import { app, BrowserWindow } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { createWindow } from './windowManager'
import { isAppQuitting, isForceQuit, setAppQuitting } from './quitState'
import { APP_PRODUCT_NAME } from '../shared/appInfo'

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

app.whenReady().then(createWindow)

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
  const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (wins.length === 0) return
  setAppQuitting(true)
  event.preventDefault()
  for (const w of wins) w.close()
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
