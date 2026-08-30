/**
 * @file main/ipcHandlers.ts
 * @description Registers every renderer -> main channel, one domain at a time.
 *
 * This used to be the domains themselves: 34 handlers and their helpers in one
 * 445-line file, so a change to the file-open flow and a change to the recent
 * list touched the same place. Each domain now owns its module under
 * `handlers/`, and this is the list of them -- which also makes the set of
 * channels the main process answers readable in one screen.
 *
 * The typed `handleInvoke` wrapper moved to `ipc/handleInvoke.ts`: everything
 * that registers a channel needs it, and reaching it through the registrar
 * meant `renderWindowIpc` and `cuemolClipboard` imported this module for nine
 * lines of type plumbing.
 */

import type { BrowserWindow } from 'electron';
import { registerAppPathHandlers } from './handlers/appPath';
import { registerAppStateHandlers } from './handlers/appState';
import { registerContextMenuHandlers } from './handlers/contextMenus';
import { registerFileDialogHandlers } from './handlers/fileDialogHandlers';
import { registerFileSystemHandlers } from './handlers/fileSystem';
import { registerMenuStateHandlers } from './handlers/menuState';
import { registerRecentFilesHandlers } from './handlers/recentFiles';
import { registerWindowHandlers } from './handlers/windowActions';

export { handleInvoke } from './ipc/handleInvoke';
export { handleOpenFile } from './fileOpen';

/**
 * Register every invoke channel the main process answers.
 *
 * @param mainWindow - The window a handler acts on when the request does not
 *   name one. Handlers that can be asked from either window resolve the
 *   sender's window themselves and fall back to this.
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerAppPathHandlers();
  registerFileDialogHandlers(mainWindow);
  registerFileSystemHandlers();
  registerAppStateHandlers();
  registerMenuStateHandlers();
  registerRecentFilesHandlers(mainWindow);
  registerContextMenuHandlers(mainWindow);
  registerWindowHandlers(mainWindow);
}
