/**
 * @file shared/pluginMenu.ts
 * @description Merging plugin menu contributions into the static `APP_MENU`.
 *
 * Both menu surfaces build from the result: the native menu in the main
 * process (main/menu.ts) and the React menu bar plus the keybinding
 * dispatcher on Windows / Linux. `APP_MENU` itself is never mutated -- the
 * merge returns a fresh group array -- so disabling a plugin simply stops it
 * from appearing in the next build.
 *
 * A contributed row carries `menu:plugin:<commandId>` as its ipcChannel.
 * That encoding is what lets the channel survive the round trip through the
 * main process, which has no view of the renderer's plugin registry, and
 * still name a command on the way back: `useMenuDispatch` decodes it and
 * dispatches the id on the command bus.
 */

import { APP_MENU } from './menuTemplate'
import type { AppMenuGroup, AppMenuItem } from './menuTemplate'
import type { PluginCommandId, PluginMenuContribution } from './types/pluginContrib'

const PLUGIN_MENU_PREFIX = 'menu:plugin:'

/** The ipcChannel shape of a plugin-contributed menu row. */
export type PluginMenuChannel = `menu:plugin:${string}`

/** The ipcChannel that dispatches `command` when its row is picked. */
export function pluginMenuChannel(command: PluginCommandId): PluginMenuChannel {
  return `${PLUGIN_MENU_PREFIX}${command}`
}

/** Type guard: does `ch` address a plugin command rather than a built-in menu action? */
export function isPluginMenuChannel(ch: string): ch is PluginMenuChannel {
  return ch.startsWith(PLUGIN_MENU_PREFIX)
}

/** The command id carried by a plugin menu channel. */
export function pluginCommandFromChannel(ch: PluginMenuChannel): PluginCommandId {
  return ch.slice(PLUGIN_MENU_PREFIX.length) as PluginCommandId
}

/** Build the rows of one contribution, with the optional leading separator. */
function contributionItems(contrib: PluginMenuContribution): AppMenuItem[] {
  const block: AppMenuItem[] = []
  if (contrib.separatorBefore) block.push({ type: 'separator' })
  for (const item of contrib.items) {
    const row: AppMenuItem = {
      id: item.id,
      label: item.label,
      ipcChannel: pluginMenuChannel(item.command),
    }
    if (item.accelerator) row.accelerator = item.accelerator
    if (item.acceleratorMac) row.acceleratorMac = item.acceleratorMac
    block.push(row)
  }
  return block
}

/** Splice one contribution's rows into a group's submenu. */
function insertItems(submenu: AppMenuItem[], contrib: PluginMenuContribution): AppMenuItem[] {
  const block = contributionItems(contrib)
  const at = contrib.after ? submenu.findIndex((i) => i.id === contrib.after) : -1
  if (at < 0) return [...submenu, ...block]
  return [...submenu.slice(0, at + 1), ...block, ...submenu.slice(at + 1)]
}

/**
 * The application menu for the currently enabled plugins.
 *
 * @param contribs - every enabled plugin's menu contributions, in plugin order.
 * @returns a group array carrying the contributed rows. With no contributions
 *   `APP_MENU` is returned as-is, so the common case adds no allocation and
 *   keeps a stable identity for callers that memoize on it.
 */
export function buildAppMenu(contribs: readonly PluginMenuContribution[]): AppMenuGroup[] {
  if (contribs.length === 0) return APP_MENU

  const byGroup = new Map<string, PluginMenuContribution[]>()
  for (const c of contribs) {
    byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c])
  }

  const groups = APP_MENU.map((group) => {
    const key = group.label.toLowerCase()
    const forGroup = byGroup.get(key)
    if (!forGroup) return group
    byGroup.delete(key)
    let submenu = group.submenu
    for (const c of forGroup) submenu = insertItems(submenu, c)
    return { ...group, submenu }
  })

  // A contribution naming a group that does not exist would otherwise vanish
  // without trace; the plugin author needs to hear about it.
  for (const key of byGroup.keys()) {
    console.warn(`[pluginMenu] no menu group "${key}" -- contribution ignored`)
  }

  return groups
}
