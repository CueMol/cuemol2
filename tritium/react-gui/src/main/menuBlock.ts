/**
 * @file main/menuBlock.ts
 * @description Modal-aware application-menu accelerator block machinery.
 *
 * When a Blueprint Dialog (or message box) is open in the renderer, or when
 * a native OS dialog is being shown from main, application-menu items are
 * temporarily disabled so accelerators like Cmd+Q stop firing -- matching
 * UXP's XUL `openDialog(..., 'modal')` behaviour.
 *
 * The text-edit items are the one exception (`TEXT_EDIT_MENU_IDS`). They are
 * declared as custom `ipcChannel` items rather than Electron roles (see
 * `shared/menuTemplate.ts`), and on macOS the application menu owns the
 * Cmd+X/C/V/A/Z key equivalents outright -- Chromium does not paste into a
 * renderer input by itself. Disabling them therefore left every dialog's text
 * field unable to cut, copy, paste, select-all or undo. They stay enabled
 * through a block; the renderer keeps them confined to the focused field for
 * the duration (see `contexts/ModalOpenCounterContext.tsx`).
 *
 * Multiple block sources are reference-counted via `blockReasons`. The
 * snapshot captures each item's `enabled` value at the moment we enter the
 * blocked state and restores it on exit, so prior `updateMenuState()` checks
 * (perspective / center-mark / bg-color) survive a block cycle.
 *
 * This module owns ONLY the block state (ref-count + snapshot). It does NOT
 * own the menu rebuild: replacing the menu mid-block would lose the snapshot,
 * so the rebuild is deferred. The owner (`main/menu.ts`) registers a callback
 * via `setDeferredRebuild()`, invoked once on the final unblock. Dependency
 * injection (rather than importing `menu.ts`) keeps the two modules free of an
 * import cycle.
 */

import { Menu } from 'electron'
import type { MenuItem } from 'electron'

/**
 * Menu item ids spared by a block, so text editing keeps working inside a
 * modal dialog. Keep in sync with the ids in `shared/menuTemplate.ts`.
 */
export const TEXT_EDIT_MENU_IDS: ReadonlySet<string> = new Set([
  'cut',
  'copy',
  'paste',
  'select-all',
  'undo',
  'redo',
])

/** Distinct block sources, each ref-counted independently. */
export type MenuBlockReason = 'blueprint' | 'native'

const blockReasons: Map<MenuBlockReason, number> = new Map()

/**
 * Per-item `enabled` values captured when the menu entered the blocked
 * state, restored verbatim on the final unblock. `null` means not blocked.
 */
export let snapshot: Map<MenuItem, boolean> | null = null

/**
 * Callback run once when the menu transitions from blocked to unblocked.
 * Registered by `main/menu.ts` (it flushes any rebuild deferred during the
 * block). Injected to avoid a menu.ts <-> menuBlock.ts import cycle.
 */
let deferredRebuild: (() => void) | null = null

/**
 * Register the callback fired on the final unblock edge.
 *
 * @param fn - Invoked from `applyUnblock()` after item `enabled` values are
 *   restored; used by `menu.ts` to flush a rebuild deferred while blocked.
 */
export function setDeferredRebuild(fn: () => void): void {
  deferredRebuild = fn
}

/** Whether the menu is currently in the blocked (snapshotted) state. */
export function isBlocked(): boolean {
  return snapshot !== null
}

/**
 * Recursively visit every MenuItem in the tree (root submenu first).
 *
 * @param menu - Menu whose items (and nested submenus) to traverse.
 * @param fn - Called once per MenuItem.
 */
export function walkMenuItems(menu: Menu, fn: (item: MenuItem) => void): void {
  for (const item of menu.items) {
    fn(item)
    if (item.submenu) walkMenuItems(item.submenu, fn)
  }
}

/** Sum the ref-counts across all block reasons. */
function totalBlockCount(): number {
  let total = 0
  for (const n of blockReasons.values()) total += n
  return total
}

/**
 * Disable every menu item except the text-edit ones, snapshotting the
 * disabled items' current `enabled` values. Spared items are left untouched
 * (and out of the snapshot), so a later `updateMenuState()` still owns them.
 */
export function applyBlock(): void {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  if (snapshot) return // already blocked
  const snap = new Map<MenuItem, boolean>()
  walkMenuItems(menu, (item) => {
    if (item.type === 'separator') return
    if (item.id && TEXT_EDIT_MENU_IDS.has(item.id)) return
    snap.set(item, item.enabled)
    item.enabled = false
  })
  snapshot = snap
}

/**
 * Restore the menu items' `enabled` values from the block snapshot, then run
 * any deferred rebuild registered via `setDeferredRebuild()`.
 */
export function applyUnblock(): void {
  if (!snapshot) return
  for (const [item, prev] of snapshot) {
    item.enabled = prev
  }
  snapshot = null
  if (deferredRebuild) deferredRebuild()
}

/**
 * Increment / decrement the block counter for a given reason. Crossing the
 * total 0 -> >=1 boundary disables every menu item; crossing >=1 -> 0
 * restores them. Calls are idempotent against the same reason being toggled
 * twice in the same direction (the counter still tracks correctly).
 *
 * @param reason - The block source ('blueprint' for renderer dialogs,
 *   'native' for OS dialogs shown from main).
 * @param blocked - true to add a block, false to remove one.
 */
export function setMenuBlocked(reason: MenuBlockReason, blocked: boolean): void {
  const prev = blockReasons.get(reason) ?? 0
  const next = blocked ? prev + 1 : Math.max(0, prev - 1)
  blockReasons.set(reason, next)
  const total = totalBlockCount()
  if (total > 0 && !snapshot) applyBlock()
  else if (total === 0 && snapshot) applyUnblock()
}

/**
 * Run an async operation with the menu blocked under the given reason.
 * Used by handlers that open native OS dialogs (showOpenDialog,
 * showSaveDialog, showMessageBox) so the parent window's menu accelerators
 * are suppressed for the duration of the dialog.
 *
 * @param reason - The block source to hold for the operation's lifetime.
 * @param op - The async operation to run while blocked.
 * @returns The resolved value of `op`.
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

/** Test-only: reset block state (ref-count + snapshot) between tests. */
export function _resetMenuBlockForTest(): void {
  blockReasons.clear()
  snapshot = null
  deferredRebuild = null
}
