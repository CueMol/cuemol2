/**
 * Application menu setup for the Electron main process.
 *
 * Menu structure is defined in shared/menuTemplate.ts so the renderer-side
 * React MenuBar can read the same data without pulling in Electron APIs.
 */

import { app, Menu } from 'electron'
import type { BrowserWindow, MenuItem, MenuItemConstructorOptions } from 'electron'
import { IPC } from '../shared/ipcChannels'
import { APP_MENU } from '../shared/menuTemplate'
import type { AppMenuItem, AppMenuGroup } from '../shared/menuTemplate'
import type { MenuState } from '../shared/ipcTypes'

export type MenuBlockReason = 'blueprint' | 'native'

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
  if (item.type === 'checkbox' || item.type === 'radio') result.type = 'checkbox'
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
            { id: 'about-mac', label: `About ${app.name}`, ipcChannel: IPC.MENU_ABOUT },
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

// ─────────────────────────────────────────────
// Modal-aware menu accelerator block
// ─────────────────────────────────────────────
//
// When a Blueprint Dialog (or message box) is open in the renderer, or when
// a native OS dialog is being shown from main, all application-menu items
// are temporarily disabled so accelerators like Cmd+Q stop firing — matching
// UXP's XUL `openDialog(..., 'modal')` behaviour.
//
// Multiple block sources are reference-counted via `blockReasons`. The
// snapshot captures each item's `enabled` value at the moment we enter the
// blocked state and restores it on exit, so prior `updateMenuState()` checks
// (perspective / center-mark / bg-color) survive a block cycle.

const blockReasons: Map<MenuBlockReason, number> = new Map()
let snapshot: Map<MenuItem, boolean> | null = null

/** Recursively visit every MenuItem in the tree (root submenu first). */
export function walkMenuItems(menu: Menu, fn: (item: MenuItem) => void): void {
  for (const item of menu.items) {
    fn(item)
    if (item.submenu) walkMenuItems(item.submenu, fn)
  }
}

function totalBlockCount(): number {
  let total = 0
  for (const n of blockReasons.values()) total += n
  return total
}

function applyBlock(): void {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  if (snapshot) return // already blocked
  const snap = new Map<MenuItem, boolean>()
  walkMenuItems(menu, (item) => {
    if (item.type === 'separator') return
    snap.set(item, item.enabled)
    item.enabled = false
  })
  snapshot = snap
}

function applyUnblock(): void {
  if (!snapshot) return
  for (const [item, prev] of snapshot) {
    item.enabled = prev
  }
  snapshot = null
}

/**
 * Increment / decrement the block counter for a given reason. Crossing the
 * total 0 -> >=1 boundary disables every menu item; crossing >=1 -> 0
 * restores them. Calls are idempotent against the same reason being toggled
 * twice in the same direction (the counter still tracks correctly).
 */
export function setMenuBlocked(reason: MenuBlockReason, blocked: boolean): void {
  const prev = blockReasons.get(reason) ?? 0
  const next = blocked ? prev + 1 : Math.max(0, prev - 1)
  blockReasons.set(reason, next)
  const total = totalBlockCount()
  if (total > 0 && !snapshot) applyBlock()
  else if (total === 0 && snapshot) applyUnblock()
}

/** Test-only: reset block state between tests. */
export function _resetMenuBlockForTest(): void {
  blockReasons.clear()
  snapshot = null
}

/**
 * Run an async operation with the menu blocked under the given reason.
 * Used by handlers that open native OS dialogs (showOpenDialog,
 * showSaveDialog, showMessageBox) so the parent window's menu accelerators
 * are suppressed for the duration of the dialog.
 */
export async function withMenuBlocked<T>(
  reason: MenuBlockReason,
  op: () => Promise<T>,
): Promise<T> {
  setMenuBlocked(reason, true)
  try {
    return await op()
  } finally {
    setMenuBlocked(reason, false)
  }
}

export function updateMenuState(state: MenuState): void {
  // While the menu is blocked, ignore renderer-side state updates. The
  // renderer is expected to re-emit on the next active-view change after
  // unblock; the snapshot itself preserves whatever enabled values were
  // current at block entry, so on unblock the menu returns to its last
  // known-good state.
  if (snapshot) return

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

  if (state.viewCenterMark) {
    const { enabled, centerMark } = state.viewCenterMark
    const markItems = [
      { id: 'center-mark-none', value: 'none' },
      { id: 'center-mark-cross', value: 'crosshair' },
      { id: 'center-mark-axis', value: 'axis' },
    ]
    for (const { id, value } of markItems) {
      const item = menu.getMenuItemById(id)
      if (item) {
        item.enabled = enabled
        item.checked = enabled && centerMark === value
      }
    }
  }

  if (state.sceneBgColor) {
    const { enabled, bgColor } = state.sceneBgColor
    const bgItems = [
      { id: 'bg-white', value: 'white' },
      { id: 'bg-black', value: 'black' },
    ]
    for (const { id, value } of bgItems) {
      const item = menu.getMenuItemById(id)
      if (item) {
        item.enabled = enabled
        item.checked = enabled && bgColor === value
      }
    }
  }
}
