/**
 * @file main/handlers/recentFiles.ts
 * @description The Open Recent list: read, append, clear.
 *
 * A change rebuilds the application menu, because the list is a submenu of it.
 */

import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { handleInvoke } from '../ipc/handleInvoke';
import { addRecent, clearRecents, getRecents } from '../recentFiles';
import { rebuildApplicationMenu } from '../menu';

/**
 * Register the recent-files channels.
 *
 * @param mainWindow - Where the updated list is pushed. The list is app-wide,
 *   but only the main window shows it.
 */
export function registerRecentFilesHandlers(mainWindow: BrowserWindow): void {
  handleInvoke(IPC.RECENT_LOAD, () => getRecents())
  handleInvoke(IPC.RECENT_ADD, (_e, entry) => {
    const next = addRecent(entry)
    // OS-level integration (macOS Dock recent items / Windows Jump List).
    try { app.addRecentDocument(entry.path) } catch { /* non-fatal */ }
    rebuildApplicationMenu()
    mainWindow.webContents.send(IPC.RECENT_UPDATED, next)
  })
  handleInvoke(IPC.RECENT_CLEAR, () => {
    const next = clearRecents()
    try { app.clearRecentDocuments() } catch { /* non-fatal */ }
    rebuildApplicationMenu()
    mainWindow.webContents.send(IPC.RECENT_UPDATED, next)
  })
}
