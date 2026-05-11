import { app, BrowserWindow } from 'electron'
import { createWindow } from './windowManager'
import { IPC } from '../shared/ipcChannels'
import { isQuitConfirmed, setQuitConfirmed } from './quitState'

app.setName('CueMol3-tritium')

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Quit lifecycle (UXP parity: confirm modified scenes before shutdown).
// First 'before-quit' preventDefaults and asks the renderer to walk every
// tab; the renderer replies via IPC.APP_QUIT_PROCEED which flips the flag
// and re-issues app.quit().
app.on('before-quit', (event) => {
  if (isQuitConfirmed()) return
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  if (!win) {
    setQuitConfirmed(true)
    return
  }
  event.preventDefault()
  win.webContents.send(IPC.APP_QUIT_REQUEST)
})
