/**
 * Application menu setup for the Electron main process.
 *
 * Menu structure is defined in shared/menuTemplate.ts so the renderer-side
 * React MenuBar can read the same data without pulling in Electron APIs.
 */

import { app, Menu, webContents } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions, WebContents } from 'electron'
import path from 'path'
import { IPC } from '@shared/ipcChannels'
import { APP_MENU } from '@shared/menuTemplate'
import type { AppMenuItem, AppMenuGroup } from '@shared/menuTemplate'
import {
  DEDICATED_DIRECT_CHANNELS,
  GENERIC_RELAY_CHANNELS,
  isMenuActionChannel,
} from '@shared/menuActionMap'
import type { RecentFileEntry } from '@shared/types/recent'
import type { MenuState } from '@shared/types/menuState'
import { applyMenuStateTo, mergeMenuState } from '@shared/menuStateApply'
import { getExistingRecents, refreshRecentsExistence } from './recentFiles'
import {
  isBlocked,
  setDeferredRebuild,
  _resetMenuBlockForTest as _resetMenuBlockStateForTest,
} from './menuBlock'

// Re-export the modal-aware block machinery from its dedicated module so
// existing importers (`handlers/fileDialogs.ts`, `ipcHandlers.ts`) keep
// importing the block API from `./menu` unchanged.
export {
  setMenuBlocked,
  resetMenuBlockReason,
  withMenuBlocked,
  walkMenuItems,
  applyBlock,
  applyUnblock,
  isBlocked,
} from './menuBlock'
export type { MenuBlockReason } from './menuBlock'

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

  // Edit actions whose meaning depends on focus. The main window routes them
  // through the renderer (see utils/editClipboard.ts); any OTHER focused
  // window -- the Rendering window, a devtools pane -- has no such routing and
  // only ever wants the native edit. Cut/Copy/Paste used to be Electron roles,
  // which did this implicitly; keeping it explicit here preserves that.
  const focusRouted: [string, NativeEditAction][] = [
    [IPC.MENU_EDIT_CUT, 'cut'],
    [IPC.MENU_EDIT_COPY, 'copy'],
    [IPC.MENU_EDIT_PASTE, 'paste'],
    [IPC.MENU_UNDO, 'undo'],
    [IPC.MENU_REDO, 'redo'],
    // Cmd+A is focus-dependent too: with the Rendering window focused it used
    // to run selectAllInScope() in the MAIN window instead of selecting the
    // text in the field under the cursor.
    [IPC.MENU_SELECT_ALL, 'selectAll'],
  ]
  for (const [ch, native] of focusRouted) {
    const toRenderer = handlers[ch] ?? (() => mainWindow.webContents.send(IPC.MENU_GENERIC, ch))
    handlers[ch] = () => {
      const focused = webContents.getFocusedWebContents()
      if (focused && focused.id !== mainWindow.webContents.id) {
        runNativeEdit(focused, native)
        return
      }
      toRenderer()
    }
  }
  return handlers
}

/** Native edit actions a focused webContents can run against its own selection. */
type NativeEditAction = 'cut' | 'copy' | 'paste' | 'undo' | 'redo' | 'selectAll'

function runNativeEdit(wc: WebContents, action: NativeEditAction): void {
  switch (action) {
    case 'cut': wc.cut(); break
    case 'copy': wc.copy(); break
    case 'paste': wc.paste(); break
    case 'undo': wc.undo(); break
    case 'redo': wc.redo(); break
    case 'selectAll': wc.selectAll(); break
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
// had been mutating directly -- otherwise the View > Perspective /
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
    // Drop groups that build to an empty submenu (e.g. Help on macOS, whose
    // only item -- About -- is othersOnly and lives in the App menu instead).
  ].filter((g) => !Array.isArray(g.submenu) || g.submenu.length > 0)

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

/**
 * Flush a rebuild deferred while the menu was blocked. Registered with
 * `menuBlock.setDeferredRebuild()` and invoked from `applyUnblock()` once
 * the block snapshot has been restored.
 */
function flushPendingRebuild(): void {
  if (pendingRebuild && mainWindowRef) {
    pendingRebuild = false
    buildAndSetMenu(mainWindowRef)
    // buildAndSetMenu already replays lastMenuState onto the new items.
    return
  }
  // No rebuild was pending, but state may have arrived during the block
  // (updateMenuState merges it and skips the live write). Apply it now.
  if (!lastMenuState) return
  const menu = Menu.getApplicationMenu()
  if (menu) applyMenuStateTo(menu, lastMenuState)
}

// Wire the unblock callback at module load rather than from createMenu: it also
// replays state pushed during a block, which can happen before -- or without --
// a menu ever being created for a window.
setDeferredRebuild(flushPendingRebuild)

/** Build and install the application menu for the given window (first run). */
export function createMenu(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow
  buildAndSetMenu(mainWindow)
  // Prune MRU entries whose file is gone. Deliberately after the first build
  // and off the menu path: this touches the filesystem, and one entry on a
  // disconnected network mount used to block every window for the mount
  // timeout. The menu is rebuilt only if the result actually changed.
  void refreshRecentsExistence(() => rebuildApplicationMenu())
}

/**
 * Rebuild the entire application menu. Call after recent files change so
 * the dynamic `open-recent` submenu refreshes. When a modal block is
 * active the rebuild is deferred -- replacing the menu mid-block would
 * lose the enabled-state snapshot. The deferred rebuild fires from
 * `menuBlock.applyUnblock()` via `flushPendingRebuild`.
 */
export function rebuildApplicationMenu(): void {
  if (!mainWindowRef) return
  if (isBlocked()) {
    pendingRebuild = true
    return
  }
  buildAndSetMenu(mainWindowRef)
}

/**
 * Test-only: reset both the menu-block state (in `menuBlock.ts`) and this
 * module's rebuild / cache state. Kept as the single reset entry point so
 * callers do not have to know the state is split across two modules.
 */
export function _resetMenuBlockForTest(): void {
  _resetMenuBlockStateForTest()
  mainWindowRef = null
  pendingRebuild = false
  lastMenuState = null
  // The menuBlock reset drops the injected callback; restore the production
  // wiring so a test does not silently run without the unblock hook.
  setDeferredRebuild(flushPendingRebuild)
}

/**
 * Apply renderer-pushed view / scene state (perspective, center-mark,
 * background) to the live menu, caching it for replay across rebuilds.
 * No-op while the menu is blocked.
 */
export function updateMenuState(state: MenuState): void {
  // Always merge into the persistent cache, even while blocked. The cache is
  // what a rebuild -- and the unblock replay below -- work from, so dropping
  // an update here loses it for good: nothing prompts the renderer to re-emit.
  // (An edit committed from inside a dialog pushes {undo:{enabled:true}} while
  // the dialog holds the block; Edit > Undo then stayed greyed out until the
  // next scene event happened to fire one.)
  lastMenuState = mergeMenuState(lastMenuState, state)

  // Writing to the live items while blocked would fight the block snapshot,
  // which restores the pre-block `enabled` values on unblock. Defer instead.
  if (isBlocked()) return

  const menu = Menu.getApplicationMenu()
  if (!menu) return
  applyMenuStateTo(menu, lastMenuState)
}
