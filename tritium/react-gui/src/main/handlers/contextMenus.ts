/**
 * @file main/handlers/contextMenus.ts
 * @description Native context menus the renderer asks for -- the scene tree,
 * the 3D view, and the text-field edit menu on Windows / Linux.
 */

import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { handleInvoke } from '../ipc/handleInvoke';
import { showNaviContextMenu } from '../naviContextMenu';
import { showSceneContextMenu } from '../sceneContextMenu';

/** Register the context-menu channels. */
export function registerContextMenuHandlers(mainWindow: BrowserWindow): void {
  handleInvoke(IPC.SCENE_CTX_SHOW, (_event, payload) =>
    showSceneContextMenu(mainWindow, payload),
  )

  handleInvoke(IPC.NAVI_CTX_SHOW, (_event, payload) =>
    showNaviContextMenu(mainWindow, payload),
  )

  // Edit role picked from the Windows/Linux React text context menu
  // (registerTextContextMenu pushes IPC.TEXT_CTX_SHOW; selectAll is handled
  // renderer-side and never reaches here).
  handleInvoke(IPC.TEXT_CTX_ACTION, (event, role) => {
    // The sender's own webContents, not mainWindow's: the Rendering window
    // registers the same context menu, so a paste there used to land in
    // whatever field was focused in the main window.
    const wc = event.sender.isDestroyed() ? mainWindow.webContents : event.sender
    switch (role) {
      case 'cut': wc.cut(); break
      case 'copy': wc.copy(); break
      case 'paste': wc.paste(); break
      // Reached only from the Edit-menu shortcuts, when focus is in a text
      // field: Cmd+Z there must undo the typing, not the scene.
      case 'undo': wc.undo(); break
      case 'redo': wc.redo(); break
      case 'selectAll': wc.selectAll(); break
    }
  })

  // Renderer reply to a WINDOW_CLOSE_REQUEST. `proceed: true` means every
  // tab is confirmed/closed: mark the window confirmed and re-issue close()
  // so the funnel lets it through. `proceed: false` (user cancelled) clears
  // the in-flight flag and aborts any in-progress quit so the next Cmd+Q
  // starts a fresh confirm chain.
}
