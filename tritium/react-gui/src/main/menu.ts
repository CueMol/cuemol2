/**
 * Application menu setup for the Electron main process.
 *
 * Menu structure is defined in shared/menuTemplate.ts so the renderer-side
 * React MenuBar can read the same data without pulling in Electron APIs.
 */

import { app, Menu } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { IPC } from '../shared/ipcChannels'
import { APP_MENU } from '../shared/menuTemplate'
import type { AppMenuItem, AppMenuGroup } from '../shared/menuTemplate'
import type { MenuState } from '../shared/ipcTypes'

const isMac = process.platform === 'darwin'

/** Specific click handlers for menu items that have real implementations. */
function buildSpecificHandlers(
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
    [IPC.MENU_VIEW_PERSPECTIVE]:  () => mainWindow.webContents.send(IPC.MENU_GENERIC, IPC.MENU_VIEW_PERSPECTIVE),
    [IPC.MENU_VIEW_ORTHOGRAPHIC]: () => mainWindow.webContents.send(IPC.MENU_GENERIC, IPC.MENU_VIEW_ORTHOGRAPHIC),
  }
}

/**
 * Recursively convert an AppMenuItem to an Electron MenuItemConstructorOptions.
 * Items with a specific handler get that handler; items with an ipcChannel but
 * no specific handler fall back to the MENU_GENERIC channel.
 */
function buildItem(
  item: AppMenuItem,
  specificHandlers: Record<string, () => void>,
  mainWindow: BrowserWindow,
): MenuItemConstructorOptions | null {
  if (item.darwinOnly && !isMac) return null
  if (item.othersOnly && isMac) return null
  if (item.type === 'separator') return { type: 'separator' }

  const result: MenuItemConstructorOptions = {}

  if (item.id) result.id = item.id
  if (item.label) result.label = item.label
  if (item.type === 'checkbox') result.type = 'checkbox'
  if (item.checked !== undefined) result.checked = item.checked
  if (item.enabled !== undefined) result.enabled = item.enabled

  // Pure role items (no ipcChannel) delegate entirely to Electron.
  if (item.role && !item.ipcChannel) {
    result.role = item.role as MenuItemConstructorOptions['role']
    return result
  }

  if (item.role) result.role = item.role as MenuItemConstructorOptions['role']

  const acc = isMac ? (item.acceleratorMac ?? item.accelerator) : item.accelerator
  if (acc) result.accelerator = acc

  if (item.ipcChannel) {
    if (specificHandlers[item.ipcChannel]) {
      result.click = specificHandlers[item.ipcChannel]
    } else {
      const ch = item.ipcChannel
      result.click = () => mainWindow.webContents.send(IPC.MENU_GENERIC, ch)
    }
  }

  if (item.submenu) {
    result.submenu = item.submenu.flatMap((i) => {
      const built = buildItem(i, specificHandlers, mainWindow)
      return built ? [built] : []
    })
  }

  return result
}

function buildGroup(
  group: AppMenuGroup,
  specificHandlers: Record<string, () => void>,
  mainWindow: BrowserWindow,
): MenuItemConstructorOptions {
  return {
    label: group.label,
    submenu: group.submenu.flatMap((item) => {
      const built = buildItem(item, specificHandlers, mainWindow)
      return built ? [built] : []
    }),
  }
}

export function createMenu(mainWindow: BrowserWindow): void {
  const specificHandlers = buildSpecificHandlers(mainWindow)

  // macOS Application menu uses app.name (only available in main process)
  const macOnlyGroups: AppMenuGroup[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { id: 'about-mac', label: `About ${app.name}`, ipcChannel: 'menu:about' },
            { type: 'separator' },
            { id: 'mac-prefs', label: 'Preferences...', accelerator: 'Cmd+,', ipcChannel: 'menu:options' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]
    : []

  // Build groups: macOS App menu first, then APP_MENU excluding the darwinOnly placeholder
  const appMenuGroups = APP_MENU.filter((g) => !g.darwinOnly)

  const template: MenuItemConstructorOptions[] = [
    ...macOnlyGroups.map((g) => buildGroup(g, specificHandlers, mainWindow)),
    ...appMenuGroups.map((g) => buildGroup(g, specificHandlers, mainWindow)),
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function updateMenuState(state: MenuState): void {
  const menu = Menu.getApplicationMenu()
  if (!menu) return

  if (state.viewProjection) {
    const { enabled, perspective } = state.viewProjection
    const perspectiveItem = menu.getMenuItemById('view-perspective')
    const orthographicItem = menu.getMenuItemById('view-orthographic')
    if (perspectiveItem) {
      perspectiveItem.enabled = enabled
      perspectiveItem.checked = enabled && perspective === true
    }
    if (orthographicItem) {
      orthographicItem.enabled = enabled
      orthographicItem.checked = enabled && perspective === false
    }
  }
}
