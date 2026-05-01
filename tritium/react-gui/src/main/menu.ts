/**
 * Application menu setup for the Electron main process.
 *
 * Menu structure is defined in shared/menuTemplate.ts so the renderer-side
 * React MenuBar can read the same data without pulling in Electron APIs.
 */

import { app, Menu } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { IPC } from '../shared/ipcChannels'
import { APP_MENU, toElectronTemplate } from '../shared/menuTemplate'
import type { AppMenuGroup } from '../shared/menuTemplate'

const isMac = process.platform === 'darwin'

/** Map from ipcChannel string to a click handler that sends the IPC event to the renderer. */
function buildClickHandlers(
  mainWindow: BrowserWindow,
): Record<string, () => void> {
  return {
    [IPC.MENU_OPEN_FILE]:  () => mainWindow.webContents.send(IPC.MENU_OPEN_FILE),
    [IPC.MENU_SAVE]:       () => mainWindow.webContents.send(IPC.MENU_SAVE),
    [IPC.MENU_NEW_TAB]:    () => mainWindow.webContents.send(IPC.MENU_NEW_TAB),
    [IPC.MENU_CLOSE_TAB]:  () => mainWindow.webContents.send(IPC.MENU_CLOSE_TAB),
    [IPC.MENU_UNDO]:       () => mainWindow.webContents.send(IPC.MENU_UNDO),
    [IPC.MENU_REDO]:       () => mainWindow.webContents.send(IPC.MENU_REDO),
    [IPC.MENU_NEW_SCENE]:  () => mainWindow.webContents.send(IPC.MENU_NEW_SCENE),
    [IPC.MENU_OPEN_SCENE]: () => mainWindow.webContents.send(IPC.MENU_OPEN_SCENE),
  }
}


export function createMenu(mainWindow: BrowserWindow): void {
  const macOnlyMenu: AppMenuGroup[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services', darwinOnly: true },
            { type: 'separator' },
            { role: 'hide', darwinOnly: true },
            { role: 'hideOthers', darwinOnly: true },
            { role: 'unhide', darwinOnly: true },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]
    : []

  const fullMenu: AppMenuGroup[] = [...macOnlyMenu, ...APP_MENU]
  const template = toElectronTemplate(fullMenu, isMac) as MenuItemConstructorOptions[]

  const handlers = buildClickHandlers(mainWindow)

  // Attach click handlers: walk through APP_MENU (offset by macOnlyMenu.length on macOS)
  const offset = macOnlyMenu.length
  template.slice(offset).forEach((group, gi) => {
    const srcGroup = APP_MENU[gi]
    if (!srcGroup) return
    const submenu = group.submenu as MenuItemConstructorOptions[] | undefined
    if (!submenu) return

    const srcItems = srcGroup.submenu.filter(
      (item) => !item.darwinOnly && !(item.othersOnly && isMac),
    )
    submenu.forEach((item, ii) => {
      const src = srcItems[ii]
      if (src?.ipcChannel && handlers[src.ipcChannel]) {
        item.click = handlers[src.ipcChannel]
      }
    })
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
