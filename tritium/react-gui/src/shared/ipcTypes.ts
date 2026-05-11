/**
 * Shared types for IPC communication between Electron main, preload, and renderer.
 *
 * This is the single source of truth for all data structures that cross
 * process boundaries. Import from here instead of defining locally.
 */

// ── Layout ─────────────────────────────────────────────────────────────────

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

// ── UI preferences ──────────────────────────────────────────────────────────

/** Miscellaneous UI preferences exchanged with the main process. */
export interface UiState {
  sidebarActiveView?: string
  selectionMolId?: string
  theme?: 'dark' | 'light'
}

// ── File dialog ─────────────────────────────────────────────────────────────

export interface ElectronFileFilter {
  name: string
  extensions: string[]
}

export interface FileDialogOptions {
  dialogType: 'open-obj' | 'open-scene'
  filters: ElectronFileFilter[]
}

// ── File events ─────────────────────────────────────────────────────────────

export interface FileOpenedData {
  name: string
  path: string
}

export interface FileErrorData {
  path: string
  error: string
}

// ── App path ────────────────────────────────────────────────────────────────

export interface AppPathInfo {
  appPath: string
  exePath: string
  modulePath: string
  isPackaged: boolean
  sysConfigPath: string
  /** Absolute path to user_styles.xml in the OS app-data directory. */
  userStylePath: string
  /** Whether userStylePath exists on disk (evaluated in Main where fs is available). */
  userStyleExists: boolean
}

// ── Native viewport context menu ────────────────────────────────────────────

export type NaviCtxAction =
  | 'centerAt'
  | 'centerAtSymm'
  | 'selectAtom'
  | 'selectResid'
  | 'selectChain'
  | 'selectMol'
  | 'addSelectAtom'
  | 'addSelectResid'
  | 'addSelectChain'
  | 'unselect'
  | 'invertSel'
  | 'toggleSidechain'
  | 'arByres3'
  | 'arByres5'
  | 'arByres7'
  | 'arByres10'
  | 'around3'
  | 'around5'
  | 'around7'
  | 'around10'

export interface NaviCtxMenuPayload {
  x: number
  y: number
  isSymm: boolean
  atomLabel: string
  rendLabel: string
  symmLabel?: string
}

// ── Scene-tree context menu (ScenePane right-click) ─────────────────────────

/**
 * Selection-submenu items applicable to object nodes (Phase 3b).
 * Mirrors UXP `workspace_panel_molsel.js`.
 */
export type SelectMolKind =
  | 'all'
  | 'unselect'
  | 'invert'
  | 'protein'
  | 'nucleic'
  | 'water'
  | 'sugar'
  | 'hydrogen'
  | 'sidechain'

/**
 * Discriminated action returned from the scene-tree native context menu.
 * Phase 3a covers the common items shared across node types; later phases
 * add type-specific actions (selection ops, paint, camera/style file I/O).
 * Object-payload union (rather than a flat string union) keeps room to add
 * action arguments — `selectMol` carries the chosen submenu item.
 */
export type SceneCtxAction =
  | { kind: 'show' }
  | { kind: 'hide' }
  | { kind: 'rename' }
  | { kind: 'delete' }
  | { kind: 'property' }
  | { kind: 'selectMol'; selectKind: SelectMolKind }

export type SceneCtxNodeType =
  | 'scene'
  | 'object'
  | 'renderer'
  | 'rendGroup'
  | 'cameraRoot'
  | 'styleRoot'
  | 'camera'
  | 'style'

export interface SceneCtxMenuPayload {
  x: number
  y: number
  nodeType: SceneCtxNodeType
  /** Display name shown as the disabled menu header. */
  nodeLabel: string
  /** Whether the targeted node is currently visible (drives Show/Hide). */
  isVisible: boolean
  /** Whether the node carries a visibility flag at all. */
  hasVisibility: boolean
}

// ── Native menu state ───────────────────────────────────────────────────────

export type ViewCenterMark = 'none' | 'crosshair' | 'axis'

export type SceneBgColor = 'white' | 'black' | 'other'

export interface MenuState {
  viewProjection?: {
    enabled: boolean
    perspective: boolean | null
  }
  viewCenterMark?: {
    enabled: boolean
    centerMark: ViewCenterMark | null
  }
  sceneBgColor?: {
    enabled: boolean
    bgColor: SceneBgColor | null
  }
}

// ── ElectronAPI ─────────────────────────────────────────────────────────────
// The ElectronAPI interface lives in ./ipcContract (it's defined in terms of
// the InvokeChannels / PushChannels maps). Re-exported here for convenience.

export type { ElectronAPI } from './ipcContract'
