import { app, BrowserWindow } from 'electron'
import { createWindow } from './windowManager'
import { isAppQuitting, setAppQuitting } from './quitState'

app.setName('CueMol3-tritium')

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
  if (isAppQuitting()) return
  const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (wins.length === 0) return
  setAppQuitting(true)
  event.preventDefault()
  for (const w of wins) w.close()
})
