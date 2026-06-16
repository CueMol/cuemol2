/**
 * Application menu setup for the Electron main process.
 *
 * Menu structure is defined in shared/menuTemplate.ts so the renderer-side
 * React MenuBar can read the same data without pulling in Electron APIs.
 */

import { app, Menu } from 'electron'
import type { BrowserWindow, MenuItem, MenuItemConstructorOptions } from 'electron'
import path from 'path'
import { IPC } from '../shared/ipcChannels'
import { APP_MENU } from '../shared/menuTemplate'
import type { AppMenuItem, AppMenuGroup } from '../shared/menuTemplate'
import {
  DEDICATED_DIRECT_CHANNELS,
  GENERIC_RELAY_CHANNELS,
  isMenuActionChannel,
} from '../shared/menuActionMap'
import type { MenuState, RecentFileEntry } from '../shared/ipcTypes'
import { applyMenuStateTo, mergeMenuState } from '../shared/menuStateApply'
import { getExistingRecents } from './recentFiles'

export type MenuBlockReason = 'blueprint' | 'native'

const isMac = process.platform === 'darwin'

/**
 * Build the dynamic `open-recent` submenu: one item per MRU entry (each
 * opening that file), a separator, and the Clear Menu item. Shows a
 * disabled `(none)` placeholder when there are no recent files.
 */
function buildRecentSubmenu(
  mainWindow: BrowserWindow,
  recents: RecentFileEntry[],
): MenuItemConstructorOptions[] {
  const clearItem: MenuItemConstructorOptions = {
    id: 'clear-recent',
    label: 'Clear Menu',
    enabled: recents.length > 0,
    click: () => mainWindow.webContents.send(IPC.MENU_GENERIC, IPC.MENU_CLEAR_RECENT),
  }
  if (recents.length === 0) {
    return [
      { label: '(none)', enabled: false },
      { type: 'separator' },
      clearItem,
    ]
  }
  const items: MenuItemConstructorOptions[] = recents.map((entry) => ({
    label: path.basename(entry.path),
    toolTip: entry.path,
    click: () =>
      mainWindow.webContents.send(IPC.MENU_OPEN_RECENT, {
        path: entry.path,
        ftype: entry.ftype,
        readerName: entry.readerName,
      }),
  }))
  items.push({ type: 'separator' })
  items.push(clearItem)
  return items
}

/**
 * Specific click handlers for menu items that have a dedicated delivery path,
 * derived from menuActionMap:
 *   - 'dedicated-direct' channels send themselves on their own push channel
 *     (the renderer subscribes via MENU_PASS_THROUGH).
 *   - 'dedicated-relay' channels (Perspective / Orthographic) relay through
 *     MENU_GENERIC carrying the channel as payload.
 * All other channels fall back to MENU_GENERIC in `buildItem`.
 */
function buildSpecificHandlers(
  mainWindow: BrowserWindow,
): Record<string, () => void> {
  const handlers: Record<string, () => void> = {}
  for (const ch of DEDICATED_DIRECT_CHANNELS) {
    handlers[ch] = () => mainWindow.webContents.send(ch)
  }
  for (const ch of GENERIC_RELAY_CHANNELS) {
    handlers[ch] = () => mainWindow.webContents.send(IPC.MENU_GENERIC, ch)
  }
  return handlers
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
    } else if (isMenuActionChannel(item.ipcChannel)) {
      const ch = item.ipcChannel
      result.click = () => mainWindow.webContents.send(IPC.MENU_GENERIC, ch)
    } else {
      // An ipcChannel that is neither a dedicated handler nor a known menu
      // action means the template and menuActionMap drifted -- the
      // exhaustiveness test guards against this, but warn defensively.
      console.warn('menu item has unknown ipcChannel:', item.ipcChannel)
    }
  }

  // The static template carries only a placeholder Clear Menu under
  // `open-recent`; replace its submenu with the dynamic MRU listing.
  if (item.id === 'open-recent') {
    result.submenu = buildRecentSubmenu(mainWindow, getExistingRecents())
    return result
  }

  if (item.submenu) {
    result.submenu = item.submenu.flatMap((i) => {
      const built = buildItem(i, specificHandlers, mainWindow)
      return built ? [built] : []
    })
  }

  return result
}

/** Convert a top-level `AppMenuGroup` to an Electron submenu group. */
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

let mainWindowRef: BrowserWindow | null = null
let pendingRebuild = false

// Most recent MenuState seen by updateMenuState. Re-applied after
// every menu rebuild because Menu.setApplicationMenu(buildFromTemplate)
// throws away the previous MenuItem instances that updateMenuState
// had been mutating directly — otherwise the View > Perspective /
// Center mark / Scene > Background entries silently return to their
// static `enabled: false` template defaults after any RECENT_ADD.
let lastMenuState: MenuState | null = null

/**
 * Build the full application menu from `APP_MENU` (plus the macOS App menu)
 * and install it, then re-apply the last cached `MenuState` so dynamic
 * view / scene checks survive the rebuild.
 */
function buildAndSetMenu(mainWindow: BrowserWindow): void {
  const specificHandlers = buildSpecificHandlers(mainWindow)

  // macOS Application menu uses app.name (only available in main process)
  const macOnlyGroups: AppMenuGroup[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { id: 'about-mac', label: `About ${app.name}`, ipcChannel: IPC.MENU_ABOUT },
            { type: 'separator' },
            { id: 'mac-prefs', label: 'Preferences...', accelerator: 'Cmd+,', ipcChannel: IPC.MENU_OPTIONS },
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

  // The fresh menu starts at the static template defaults; restore the
  // last view/scene state cached from earlier updateMenuState pushes so
  // that View > Perspective / Center mark / Scene > Background do not
  // gray out across an MRU-triggered rebuild.
  if (lastMenuState) {
    const menu = Menu.getApplicationMenu()
    if (menu) applyMenuStateTo(menu, lastMenuState)
  }
}

/** Build and install the application menu for the given window (first run). */
export function createMenu(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow
  buildAndSetMenu(mainWindow)
}

/**
 * Rebuild the entire application menu. Call after recent files change so
 * the dynamic `open-recent` submenu refreshes. When a modal block is
 * active the rebuild is deferred — replacing the menu mid-block would
 * lose the enabled-state snapshot. The deferred rebuild fires from
 * `applyUnblock()`.
 */
export function rebuildApplicationMenu(): void {
  if (!mainWindowRef) return
  if (snapshot) {
    pendingRebuild = true
    return
  }
  buildAndSetMenu(mainWindowRef)
}

// --- Modal-aware menu accelerator block ---
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

/** Disable every menu item, snapshotting their current `enabled` values. */
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

/** Restore the menu items' `enabled` values from the block snapshot, then run any deferred rebuild. */
function applyUnblock(): void {
  if (!snapshot) return
  for (const [item, prev] of snapshot) {
    item.enabled = prev
  }
  snapshot = null
  if (pendingRebuild && mainWindowRef) {
    pendingRebuild = false
    buildAndSetMenu(mainWindowRef)
  }
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
  mainWindowRef = null
  pendingRebuild = false
  lastMenuState = null
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

/**
 * Apply renderer-pushed view / scene state (perspective, center-mark,
 * background) to the live menu, caching it for replay across rebuilds.
 * No-op while the menu is blocked.
 */
export function updateMenuState(state: MenuState): void {
  // While the menu is blocked, ignore renderer-side state updates. The
  // renderer is expected to re-emit on the next active-view change after
  // unblock; the snapshot itself preserves whatever enabled values were
  // current at block entry, so on unblock the menu returns to its last
  // known-good state.
  if (snapshot) return

  // Merge into the persistent cache so a later menu rebuild can replay
  // the full view/scene state onto the freshly built MenuItem instances.
  lastMenuState = mergeMenuState(lastMenuState, state)

  const menu = Menu.getApplicationMenu()
  if (!menu) return
  applyMenuStateTo(menu, lastMenuState)
}
