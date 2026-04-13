/**
 * Persistent application state powered by electron-store.
 *
 * The store is organised into top-level namespaces:
 *   - `windowBounds` – window geometry and maximised flag
 *   - `layout`       – splitter positions and panel open/close state
 *   - `ui`           – miscellaneous UI preferences
 */

import Store from 'electron-store'
import type { LayoutState, UiState } from '../shared/ipcTypes'

export type { LayoutState, UiState, PaneCollapseState } from '../shared/ipcTypes'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

interface StoreSchema {
  windowBounds: WindowBounds
  layout: LayoutState
  ui: UiState
}

// ─────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────

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
  },
}

// ─────────────────────────────────────────────
// Store instance (lazy singleton)
// ─────────────────────────────────────────────

let _store: Store<StoreSchema> | null = null

function getStore(): Store<StoreSchema> {
  if (!_store) {
    _store = new Store<StoreSchema>({ name: 'app-state', defaults: DEFAULTS })
  }
  return _store
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export function loadWindowBounds(): WindowBounds {
  return getStore().get('windowBounds')
}

export function saveWindowBounds(bounds: WindowBounds): void {
  getStore().set('windowBounds', bounds)
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
