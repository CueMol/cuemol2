/**
 * @file shell/menu/resolveAppMenu.ts
 * @description Pure resolution of the shared `APP_MENU` template into
 * platform-neutral `MenuNode` trees for the Windows/Linux menu bar.
 *
 * All live item state is derived here at build time -- View-menu radio state
 * (projection / center mark / background color) from the current view props,
 * scene-operation gating from `hasScene`, export-item filtering from the
 * available exporter list, and the dynamic "Open Recent" MRU expansion --
 * so the rendering side (`MenuPanel`) stays purely presentational.
 */
import { getRoleLabel, isExportItemUnavailable } from '@shared/menuTemplate'
import type { AppMenuItem } from '@shared/menuTemplate'
import type { RecentFileEntry } from '@shared/types/recent'
import type { SceneBgColor, ViewCenterMark } from '@shared/types/menuState'
import { SCENE_REQUIRING_MENU_IDS } from '@shared/menuStateApply'
import type { MenuNode } from '@shared/menuNodes'

/** Action payload resolved when a menu bar dropdown row is picked. */
export type MenuBarPick =
  | { kind: 'item'; item: AppMenuItem }
  | { kind: 'recent'; entry: RecentFileEntry }

/** Live state consulted while resolving item enabled / checked flags. */
export interface MenuBarStateContext {
  viewProjection?: boolean | null
  viewCenterMark?: ViewCenterMark | null
  sceneBgColor?: SceneBgColor | null
  hasScene?: boolean
  exportAvailable?: string[] | null
  recentFiles?: RecentFileEntry[]
}

/** Return the last path segment of a file path (handles both / and \). */
function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}

/** Resolve a menu item's display label from its `label` or its `role`. */
function getItemLabel(item: AppMenuItem): string {
  if (item.label) return item.label
  if (item.role) return getRoleLabel(item.role)
  return ''
}

/**
 * Build the dynamic "Open Recent" submenu: MRU items + separator + Clear
 * Menu. Mirrors the native menu build in main/menu.ts so both UI paths
 * render the same structure.
 */
function buildRecentSubmenu(recents: RecentFileEntry[]): MenuNode<MenuBarPick>[] {
  // Routed through the normal item pick path so the existing
  // 'menu:clear-recent' ipcChannel dispatch keeps working.
  const clearNode: MenuNode<MenuBarPick> = {
    label: 'Clear Menu',
    enabled: recents.length > 0,
    action: { kind: 'item', item: { id: 'clear-recent', label: 'Clear Menu', ipcChannel: 'menu:clear-recent' } },
  }
  if (recents.length === 0) {
    return [{ label: '(none)', enabled: false }, { type: 'separator' }, clearNode]
  }
  const items: MenuNode<MenuBarPick>[] = recents.map((entry) => ({
    label: basename(entry.path),
    action: { kind: 'recent', entry },
  }))
  items.push({ type: 'separator' })
  items.push(clearNode)
  return items
}

/**
 * Enabled state for a scene-operation item (Save / Export / tools, ...), or
 * null if `item` is not one. Disabled when no molview tab is active,
 * mirroring the native menu's `sceneOps` gate.
 */
function getSceneOpsState(item: AppMenuItem, hasScene: boolean | undefined): { enabled: boolean } | null {
  if (!item.id || !SCENE_REQUIRING_MENU_IDS.includes(item.id)) return null
  return { enabled: hasScene === true }
}

/**
 * Derive enabled / checked state for the perspective / orthographic radio
 * items, or null if `item` is neither.
 */
function getViewProjectionState(
  item: AppMenuItem,
  viewProjection: boolean | null | undefined,
): { enabled: boolean; checked: boolean } | null {
  if (item.id === 'view-perspective') {
    return { enabled: viewProjection !== null && viewProjection !== undefined, checked: viewProjection === true }
  }
  if (item.id === 'view-orthographic') {
    return { enabled: viewProjection !== null && viewProjection !== undefined, checked: viewProjection === false }
  }
  return null
}

/**
 * Derive enabled / checked state for the center-mark radio items
 * (none / crosshair / axis), or null if `item` is none of them.
 */
function getViewCenterMarkState(
  item: AppMenuItem,
  viewCenterMark: ViewCenterMark | null | undefined,
): { enabled: boolean; checked: boolean } | null {
  const itemValues: Record<string, ViewCenterMark> = {
    'center-mark-none': 'none',
    'center-mark-cross': 'crosshair',
    'center-mark-axis': 'axis',
  }
  if (!item.id || !(item.id in itemValues)) return null
  return {
    enabled: viewCenterMark !== null && viewCenterMark !== undefined,
    checked: viewCenterMark === itemValues[item.id],
  }
}

/**
 * Derive enabled / checked state for the background-color radio items
 * (white / black), or null if `item` is neither.
 */
function getSceneBgColorState(
  item: AppMenuItem,
  sceneBgColor: SceneBgColor | null | undefined,
): { enabled: boolean; checked: boolean } | null {
  const itemValues: Record<string, SceneBgColor> = {
    'bg-white': 'white',
    'bg-black': 'black',
  }
  if (!item.id || !(item.id in itemValues)) return null
  return {
    enabled: sceneBgColor !== null && sceneBgColor !== undefined,
    checked: sceneBgColor === itemValues[item.id],
  }
}

/** Resolve one `AppMenuItem` (and its subtree) into a `MenuNode`. */
function resolveItem(item: AppMenuItem, ctx: MenuBarStateContext): MenuNode<MenuBarPick> {
  if (item.type === 'separator') return { type: 'separator' }

  const projectionState = getViewProjectionState(item, ctx.viewProjection)
  const centerMarkState = getViewCenterMarkState(item, ctx.viewCenterMark)
  const bgColorState = getSceneBgColorState(item, ctx.sceneBgColor)
  const sceneOpsState = getSceneOpsState(item, ctx.hasScene)
  const enabled =
    projectionState?.enabled ??
    centerMarkState?.enabled ??
    bgColorState?.enabled ??
    sceneOpsState?.enabled ??
    item.enabled ??
    true
  const checked = projectionState?.checked ?? centerMarkState?.checked ?? bgColorState?.checked ?? item.checked ?? false

  // Expand the static placeholder for "Open Recent" with the live MRU list;
  // drop scene-export items whose exporter is not built into libcuemol2.
  let submenu: MenuNode<MenuBarPick>[] | undefined
  if (item.id === 'open-recent') {
    submenu = buildRecentSubmenu(ctx.recentFiles ?? [])
  } else if (item.submenu) {
    submenu = item.submenu
      .filter((sub) => !isExportItemUnavailable(sub, ctx.exportAvailable ?? null))
      .map((sub) => resolveItem(sub, ctx))
  }

  const node: MenuNode<MenuBarPick> = {
    label: getItemLabel(item),
    enabled,
  }
  if (item.type === 'checkbox' || item.type === 'radio') {
    node.type = item.type
    node.checked = checked
  }
  if (item.accelerator) node.accelerator = item.accelerator
  if (submenu) node.submenu = submenu
  else node.action = { kind: 'item', item }
  return node
}

/** Resolve a menu bar group's items into `MenuNode` trees for `MenuPanel`. */
export function resolveAppMenuNodes(items: AppMenuItem[], ctx: MenuBarStateContext): MenuNode<MenuBarPick>[] {
  return items.filter((item) => !item.darwinOnly).map((item) => resolveItem(item, ctx))
}
