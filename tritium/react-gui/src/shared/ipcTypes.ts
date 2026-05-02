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
  /** File text content. Omitted for binary/mol files that are loaded by path. */
  content?: string
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

// ── ElectronAPI (the contextBridge contract) ────────────────────────────────

export interface ElectronAPI {
  platform: string

  // App path info (for CueMol core init)
  getAppPathInfo: () => Promise<AppPathInfo>

  // File operations
  openFile: (options: FileDialogOptions) => Promise<void>

  // Menu event listeners (return unsubscribe function)
  onObjFileOpened:   (callback: (data: FileOpenedData) => void) => () => void
  onSceneFileOpened: (callback: (data: FileOpenedData) => void) => () => void
  onFileError: (callback: (data: FileErrorData) => void) => () => void
  onMenuNewTab: (callback: () => void) => () => void
  onMenuCloseTab: (callback: () => void) => () => void
  onMenuSave: (callback: () => void) => () => void
  onMenuNewScene: (callback: () => void) => () => void
  onMenuOpenFile: (callback: () => void) => () => void
  onMenuOpenScene: (callback: () => void) => () => void
  onMenuUndo: (callback: () => void) => () => void
  onMenuRedo: (callback: () => void) => () => void

  // Invoke a native menu role action from the renderer (non-macOS custom menu)
  invokeMenuRole: (role: string) => Promise<void>

  // Show native viewport context menu; resolves with the chosen action or null
  showNaviContextMenu: (payload: NaviCtxMenuPayload) => Promise<NaviCtxAction | null>

  // macOS-specific gesture events (sourced from Electron BrowserWindow)
  onRotateGesture: (callback: (rotation: number) => void) => () => void

  // Layout persistence
  loadLayout: () => Promise<LayoutState>
  saveLayout: (state: LayoutState) => Promise<void>

  // UI preferences persistence
  loadUi: () => Promise<UiState>
  saveUi: (state: Partial<UiState>) => Promise<void>
}
