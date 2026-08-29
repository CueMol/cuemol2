/**
 * @file shared/types/layout.ts
 * @description Splitter / panel layout state exchanged with the main process.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 *
 * Persisted on disk by main/stateStore.ts (electron-store). Changes must be
 * additive: a removed or renamed field silently drops what users saved.
 */

/** Collapse state for sidebar sub-panels, keyed by pane id. */
export type PaneCollapseState = Record<string, boolean>

/**
 * Persisted splitter / panel state.
 *
 * The flat `explorerSizes` / `explorerCollapsed` / `selectionSizes` /
 * `selectionCollapsed` keys are kept for backwards compatibility with
 * existing on-disk electron-store data. New code uses the generic
 * `viewSizes` / `viewCollapsed` maps instead.
 */
export interface LayoutState {
  mainSizes?: number[]
  rightPanelSizes?: number[]
  centerSizes?: number[]
  sidebarOpen?: boolean
  inspectorOpen?: boolean
  // legacy flat keys (on-disk compatibility)
  explorerSizes?: number[]
  explorerCollapsed?: Record<string, boolean>
  selectionSizes?: number[]
  selectionCollapsed?: Record<string, boolean>
  // modern generic keys
  viewSizes?: Record<string, number[]>
  viewCollapsed?: Record<string, PaneCollapseState>
}
