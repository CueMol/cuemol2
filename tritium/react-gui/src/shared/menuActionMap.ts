/**
 * @file shared/menuActionMap.ts
 * @description Single typed source of truth for the menu-action pipeline.
 *
 * The menu pipeline spans four tables that historically drifted because each
 * was hand-maintained:
 *   1. menuTemplate.ts  -- the menu item ipcChannel strings
 *   2. main/menu.ts     -- which channels get a dedicated main-process handler
 *                          vs the MENU_GENERIC fallback
 *   3. useElectronIpc   -- MENU_PASS_THROUGH (channels delivered on their own
 *                          push channel and forwarded to the dispatcher)
 *   4. useMenuDispatch  -- channel -> command dispatch
 *
 * This map mirrors the InvokeChannels / CommandMap discipline: one entry per
 * menu action, keyed by its IPC channel string. The four tables are then
 * DERIVED from it (see `MENU_PASS_THROUGH`, `DEDICATED_DIRECT_CHANNELS`,
 * `GENERIC_RELAY_CHANNELS`) so adding / renaming an action is a single edit
 * that the type system propagates.
 *
 * Layering constraint: this file is imported by BOTH the Electron main process
 * (native menu) and the renderer (React MenuBar). It must NOT import `electron`
 * and must NOT import renderer-only modules (e.g. CmdId). The dispatch target
 * is therefore stored as the literal command-id string (or a special marker);
 * the renderer's useMenuDispatch resolves it against CmdId with an exhaustive
 * table.
 */

import { IPC } from './ipcChannels'

/**
 * How a menu activation reaches the renderer dispatcher.
 *
 * - 'dedicated-direct': main sends the channel ON ITS OWN push channel; the
 *   renderer subscribes via MENU_PASS_THROUGH and forwards it. Used for the
 *   hot / always-available actions (file, tab, undo/redo, scene).
 * - 'dedicated-relay': main has a dedicated handler but relays through
 *   MENU_GENERIC carrying the channel as payload (Perspective / Orthographic).
 *   The dedicated handler exists so main can special-case the send, but the
 *   wire shape is the generic one.
 * - 'generic': no dedicated handler; main's buildItem falls back to
 *   `send(MENU_GENERIC, channel)`.
 *
 * The asymmetry is load-bearing: MENU_PASS_THROUGH must equal exactly the
 * 'dedicated-direct' set, and the MENU_GENERIC listener must catch both
 * 'dedicated-relay' and 'generic'.
 */
export type MenuDeliver = 'dedicated-direct' | 'dedicated-relay' | 'generic'

/**
 * Dispatch target for a menu action. Either the literal command-id string that
 * useMenuDispatch passes to the command bus, or a special marker:
 * - 'select-all'  : runs selectAllInScope() directly (no command bus)
 * - 'recent-clear': invokes IPC.RECENT_CLEAR directly
 * - 'unimplemented': genuinely not-yet-ported; hits the console.warn branch.
 *   These MUST stay in the template (UXP parity) and are marked so a typo is
 *   distinguishable from an intentional placeholder.
 */
export type MenuDispatchTarget = string

/** Metadata for one menu action. */
export interface MenuActionEntry {
  /** Default label (presentation lives in menuTemplate; kept here for docs / future single-source). */
  label?: string
  /** Electron accelerator string. */
  accelerator?: string
  /** macOS-specific accelerator override (undo/redo differ from Win/Linux). */
  acceleratorMac?: string
  /** Command-id string or special marker resolved by useMenuDispatch. */
  dispatch: MenuDispatchTarget
  /** Delivery routing from main to the renderer dispatcher. */
  deliver: MenuDeliver
}

/** Special dispatch markers (not command-bus ids). */
export const MENU_DISPATCH_SELECT_ALL = 'select-all'
export const MENU_DISPATCH_RECENT_CLEAR = 'recent-clear'
export const MENU_DISPATCH_UNIMPLEMENTED = 'unimplemented'

/**
 * The map. Keys are IPC channel strings (= menuTemplate ipcChannel values).
 * Command-id strings here mirror renderer/commands/ids.ts CmdId values; the
 * renderer resolves them via an exhaustive table so a drift is a tsc error.
 */
export const MENU_ACTION_MAP = {
  // --- File ---
  [IPC.MENU_NEW_WINDOW]:       { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_NEW_TAB]:          { dispatch: 'tab.new',            deliver: 'dedicated-direct' },
  [IPC.MENU_OPEN_FILE]:        { dispatch: 'ui.openObjDialog',   deliver: 'dedicated-direct' },
  [IPC.MENU_GET_PDB]:          { dispatch: 'ui.getPdbDialog',    deliver: 'generic' },
  [IPC.MENU_CLEAR_RECENT]:     { dispatch: MENU_DISPATCH_RECENT_CLEAR, deliver: 'generic' },
  [IPC.MENU_SAVE_FILE_AS]:     { dispatch: 'object.saveAs',      deliver: 'generic' },
  [IPC.MENU_SAVE_CURRENT_VIEW]:{ dispatch: 'file.saveCurrentView', deliver: 'generic' },
  [IPC.MENU_CLOSE_TAB]:        { dispatch: 'tab.close',          deliver: 'dedicated-direct' },
  [IPC.MENU_OPEN_SCENE]:       { dispatch: 'ui.openSceneDialog', deliver: 'dedicated-direct' },
  [IPC.MENU_RELOAD_SCENE]:     { dispatch: 'scene.reload',       deliver: 'generic' },
  [IPC.MENU_SAVE]:             { dispatch: 'file.save',          deliver: 'dedicated-direct' },
  [IPC.MENU_SAVE_SCENE_AS]:    { dispatch: 'file.saveAs',        deliver: 'generic' },
  // New Scene has no template item but is a real dedicated action (MENU_PASS_THROUGH).
  [IPC.MENU_NEW_SCENE]:        { dispatch: 'scene.new',          deliver: 'dedicated-direct' },

  // --- Edit ---
  [IPC.MENU_UNDO]:             { dispatch: 'edit.undo',          deliver: 'dedicated-direct' },
  [IPC.MENU_REDO]:             { dispatch: 'edit.redo',          deliver: 'dedicated-direct' },
  [IPC.MENU_SELECT_ALL]:       { dispatch: MENU_DISPATCH_SELECT_ALL, deliver: 'generic' },
  [IPC.MENU_CLEAR_UNDO]:       { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_MERGE_MOL]:        { dispatch: 'ui.mergeMolDialog',  deliver: 'generic' },
  [IPC.MENU_DELETE_MOL_ATOMS]: { dispatch: 'ui.deleteMolDialog', deliver: 'generic' },
  [IPC.MENU_CHANGE_CHAIN_ID]:  { dispatch: 'ui.changeChainIdDialog', deliver: 'generic' },
  [IPC.MENU_CHANGE_RESID_NUM]: { dispatch: 'ui.changeResidueIndexDialog', deliver: 'generic' },
  [IPC.MENU_OPTIONS]:          { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },

  // --- Rendering ---
  [IPC.MENU_POV_RENDER]:       { dispatch: 'ui.renderWindow',    deliver: 'generic' },
  [IPC.MENU_ANIM_RENDER]:      { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_EXPORT_PNG]:       { dispatch: 'scene.export.png',     deliver: 'generic' },
  [IPC.MENU_EXPORT_UMBREON]:   { dispatch: 'scene.export.umbreon', deliver: 'generic' },
  [IPC.MENU_EXPORT_POV]:       { dispatch: 'scene.export.pov',     deliver: 'generic' },
  [IPC.MENU_EXPORT_STL]:       { dispatch: 'scene.export.stl',     deliver: 'generic' },
  [IPC.MENU_EXPORT_MQO]:       { dispatch: 'scene.export.mqo',     deliver: 'generic' },

  // --- Scene ---
  [IPC.MENU_COLOR_PROOF]:      { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_SCENE_PROPS]:      { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_BG_WHITE]:         { dispatch: 'scene.bg.white',     deliver: 'generic' },
  [IPC.MENU_BG_BLACK]:         { dispatch: 'scene.bg.black',     deliver: 'generic' },

  // --- View ---
  [IPC.MENU_VIEW_PERSPECTIVE]: { dispatch: 'view.perspective',  deliver: 'dedicated-relay' },
  [IPC.MENU_VIEW_ORTHOGRAPHIC]:{ dispatch: 'view.orthographic', deliver: 'dedicated-relay' },
  [IPC.MENU_CENTER_MARK_CROSS]:{ dispatch: 'view.centerMark.cross', deliver: 'generic' },
  [IPC.MENU_CENTER_MARK_AXIS]: { dispatch: 'view.centerMark.axis',  deliver: 'generic' },
  [IPC.MENU_CENTER_MARK_NONE]: { dispatch: 'view.centerMark.none',  deliver: 'generic' },
  [IPC.MENU_VIEW_PROPS]:       { dispatch: 'ui.viewProperty',   deliver: 'generic' },

  // --- Tools ---
  [IPC.MENU_MOL_SUPERPOSE]:    { dispatch: 'ui.molSuperpose',    deliver: 'generic' },
  [IPC.MENU_BOND_EDITOR]:      { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_INTERACTION]:      { dispatch: 'ui.interactionAnalysisDialog', deliver: 'generic' },
  [IPC.MENU_REASSIGN_2NDRY]:   { dispatch: 'ui.reassignProt2ndryDialog', deliver: 'generic' },
  [IPC.MENU_MORPH_ANIM]:       { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_MOL_SURF]:         { dispatch: 'ui.makeMolSurfDialog', deliver: 'generic' },
  [IPC.MENU_SURF_CUTTER]:      { dispatch: 'ui.cutSurfByPlaneDialog', deliver: 'generic' },
  [IPC.MENU_APBS]:             { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_EXEC_SCRIPT]:      { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_PERF_MEAS]:        { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },

  // --- Window ---
  [IPC.MENU_TOGGLE_TOPBAR]:    { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_CLEAR_LOG]:        { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_RESTORE_PANELS]:   { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },

  // --- Help ---
  [IPC.MENU_ABOUT]:            { dispatch: 'ui.aboutDialog',     deliver: 'generic' },
  [IPC.MENU_ABOUT_PLUGINS]:    { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_ABOUT_CONFIG]:     { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_ADDON_MGR]:        { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_CONSOLE]:          { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
  [IPC.MENU_CHECK_UPDATES]:    { dispatch: MENU_DISPATCH_UNIMPLEMENTED, deliver: 'generic' },
} as const satisfies Record<string, MenuActionEntry>

/** Union of all valid menu-action channel keys. */
export type MenuActionChannel = keyof typeof MENU_ACTION_MAP

/** Type guard: is `ch` a known menu-action channel? */
export function isMenuActionChannel(ch: string): ch is MenuActionChannel {
  return Object.prototype.hasOwnProperty.call(MENU_ACTION_MAP, ch)
}

/**
 * Channels delivered on their own dedicated push channel (received via
 * MENU_PASS_THROUGH in the renderer). Derived from the map.
 */
export const DEDICATED_DIRECT_CHANNELS: readonly MenuActionChannel[] = (
  Object.keys(MENU_ACTION_MAP) as MenuActionChannel[]
).filter((ch) => MENU_ACTION_MAP[ch].deliver === 'dedicated-direct')

/**
 * Channels with a dedicated main handler that relays through MENU_GENERIC
 * (Perspective / Orthographic). Derived from the map.
 */
export const GENERIC_RELAY_CHANNELS: readonly MenuActionChannel[] = (
  Object.keys(MENU_ACTION_MAP) as MenuActionChannel[]
).filter((ch) => MENU_ACTION_MAP[ch].deliver === 'dedicated-relay')

/**
 * The renderer's MENU_PASS_THROUGH receiver list: exactly the dedicated-direct
 * channels. Each is subscribed as a bare push channel and forwarded to the
 * menu dispatcher.
 */
export const MENU_PASS_THROUGH_CHANNELS = DEDICATED_DIRECT_CHANNELS

/** True iff this channel is a genuinely-unimplemented placeholder. */
export function isUnimplementedMenuAction(ch: MenuActionChannel): boolean {
  return MENU_ACTION_MAP[ch].dispatch === MENU_DISPATCH_UNIMPLEMENTED
}
