/**
 * Persistent application state powered by electron-store.
 *
 * The store is organised into top-level namespaces:
 *   - `windowBounds` -- window geometry and maximised flag
 *   - `layout`       -- splitter positions and panel open/close state
 *   - `ui`           -- miscellaneous UI preferences
 */

import Store from 'electron-store'
import type { LayoutState, RecentFileEntry, UiState } from '@shared/ipcTypes'

export type { LayoutState, UiState, PaneCollapseState } from '@shared/ipcTypes'

// --- Types ---

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

interface StoreSchema {
  windowBounds: WindowBounds
  /** Rendering-window geometry; absent until the user first moves/resizes it. */
  renderWindowBounds?: WindowBounds
  layout: LayoutState
  ui: UiState
  recentFiles: RecentFileEntry[]
}

// --- Defaults ---

const DEFAULTS: StoreSchema = {
  windowBounds: { x: 0, y: 0, width: 1400, height: 900, isMaximized: false },
  layout: {
    mainSizes: [],
    rightPanelSizes: [],
    centerSizes: [],
    sidebarOpen: true,
    inspectorOpen: false,
    explorerSizes: [220, 240],
    explorerCollapsed: { scene: false, color: false },
    selectionSizes: [260, 180],
    selectionCollapsed: { mol: false, selection: false },
  },
  ui: {
    sidebarActiveView: 'explorer',
    theme: 'dark',
    inputDeviceMode: 'auto',
  },
  recentFiles: [],
}

// --- Store instance (lazy singleton) ---

let _store: Store<StoreSchema> | null = null

function getStore(): Store<StoreSchema> {
  if (!_store) {
    _store = new Store<StoreSchema>({ name: 'app-state', defaults: DEFAULTS })
  }
  return _store
}

// --- Public API ---

export function loadWindowBounds(): WindowBounds {
  return getStore().get('windowBounds')
}

export function saveWindowBounds(bounds: WindowBounds): void {
  getStore().set('windowBounds', bounds)
}

/**
 * Load the Rendering-window geometry, or undefined when it has never been
 * saved. A `{0,0}`-positioned entry is also treated as never-saved: earlier
 * builds persisted that as a schema default, and restoring it puts the
 * title bar under the macOS menu bar where it cannot be gripped.
 */
export function loadRenderWindowBounds(): WindowBounds | undefined {
  const b = getStore().get('renderWindowBounds')
  if (!b) return undefined
  if (b.x === 0 && b.y === 0) return undefined
  return b
}

export function saveRenderWindowBounds(bounds: WindowBounds): void {
  getStore().set('renderWindowBounds', bounds)
}

export function loadLayout(): LayoutState {
  return getStore().get('layout')
}

export function saveLayout(layout: LayoutState): void {
  const current = getStore().get('layout')
  getStore().set('layout', { ...current, ...layout })
}

export function loadUi(): UiState {
  return getStore().get('ui')
}

export function saveUi(ui: Partial<UiState>): void {
  const current = getStore().get('ui')
  getStore().set('ui', { ...current, ...ui })
}

export function loadRecentFiles(): RecentFileEntry[] {
  const v = getStore().get('recentFiles')
  return Array.isArray(v) ? v : []
}

export function saveRecentFiles(entries: RecentFileEntry[]): void {
  getStore().set('recentFiles', entries)
}
