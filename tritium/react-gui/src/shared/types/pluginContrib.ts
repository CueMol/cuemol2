/**
 * @file shared/types/pluginContrib.ts
 * @description Plugin contribution types that BOTH the Electron main process
 * and the renderer need.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 *
 * Only the MENU contribution lives here, because the native application menu
 * is built in main and therefore has to understand the shape. The remaining
 * contribution kinds (toolbar / views / bottom tabs) name renderer-side icon
 * keys and React components, so they stay in renderer/plugin-host/types.ts.
 */

/**
 * A plugin command id.
 *
 * Namespaced as `plugin.<pluginId>.<name>` so it can never collide with a
 * built-in `CmdId` (which the closed `CommandMap` still owns) and so the
 * owning plugin is readable from the id alone.
 */
export type PluginCommandId = `plugin.${string}`

/**
 * A top-level `APP_MENU` group a plugin may contribute to, named by the
 * group's label in lower case.
 */
export type PluginMenuGroupId =
  | 'file'
  | 'edit'
  | 'rendering'
  | 'scene'
  | 'view'
  | 'tools'
  | 'window'
  | 'help'

/** One menu row contributed by a plugin. */
export interface PluginMenuItem {
  /** Item id. Must be unique across the whole menu (it is how main addresses the row). */
  id: string
  label: string
  /** Plugin command dispatched when the row is picked. */
  command: PluginCommandId
  accelerator?: string
  /** macOS-specific accelerator override, as in `AppMenuItem`. */
  acceleratorMac?: string
}

/** The rows one plugin adds to one menu group. */
export interface PluginMenuContribution {
  group: PluginMenuGroupId
  /**
   * Insert the block right after the item carrying this id. When absent -- or
   * when no such item exists -- the block goes to the end of the group.
   */
  after?: string
  /** Put a separator ahead of the inserted block. */
  separatorBefore?: boolean
  items: PluginMenuItem[]
}

/** Payload of the renderer -> main push of the current menu contributions. */
export interface PluginMenuContributionsReq {
  menus: PluginMenuContribution[]
}
