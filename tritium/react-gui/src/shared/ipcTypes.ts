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
 * Coloring-submenu IDs applicable to renderer nodes (Phase 3c).
 * Mirrors UXP `workspace_panel.xul` `wspcPanelRendColMenu` values.
 *
 * IDs prefixed with `style-` go through `Renderer.applyStyles` after
 * stripping existing `/Paint$/` entries (mirrors `Qm2Main.setRendColoring`'s
 * style-* branch). The suffix is the StyleManager style name; static labels
 * for the CPK molcol / dark / light wired in Phase 3c-1 are kept here as
 * literal subtypes for documentation. Dynamic Paint (Secondary str.) entries
 * (Phase 3c-2) fold into the same template-literal supertype.
 *
 * IDs prefixed with `paint-type-` instantiate a fresh coloring object and
 * assign it to `rend.coloring`.
 */
export type RendColoringStyleId =
  | 'style-DefaultCPKColoring'
  | 'style-DarkCPKColoring'
  | 'style-LightCPKColoring'
  | `style-${string}`

export type RendColoringId =
  | RendColoringStyleId
  | 'paint-type-bfac'
  | 'paint-type-rainbow'

/**
 * Renderer "Change sel" submenu items (UXP `setRendSel`). 'current' uses
 * the parent mol's UI selection; the others compile a canned predicate.
 */
export type ChangeRendSelKind =
  | 'current'
  | 'all'
  | 'protein'
  | 'nucleic'
  | 'water'
  | 'ligand'
  | 'sugar'

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
  | { kind: 'copy' }
  | { kind: 'paste' }
  | { kind: 'setRendColoring'; coloringId: RendColoringId }
  | { kind: 'paintRend'; colorValue: string }
  | { kind: 'applyRendStyle'; styleName: string; pattern: string; flags: string }
  | { kind: 'setSceneBgColor'; color: 'white' | 'black' }
  | { kind: 'toggleColorProofing' }
  | { kind: 'setRendSel'; selKind: ChangeRendSelKind }
  | { kind: 'generateSurfObj' }
  | { kind: 'newRendGroup' }

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
  /** What the worker clipboard holds, used to gate Paste items. */
  clipboardKind: 'object' | 'renderer' | null
  /**
   * Whether the targeted renderer supports the Coloring submenu (Phase 3c).
   * False for the special `*selection` / `*namelabel` / `atomintr` types
   * and for rendGroup containers. Renderer ctx only.
   */
  supportsColoring?: boolean
  /**
   * Dynamic entries for the "Paint (Secondary str.)" sub-submenu under
   * Coloring (Phase 3c-2). Populated via `getPaintColoringStyles` worker
   * service when `supportsColoring` is true; an empty list hides the
   * sub-submenu entirely.
   */
  paintStyles?: { name: string; label: string }[]
  /**
   * Whether the Paint color-picker submenu (Phase 3c-3a) should appear.
   * True iff the renderer's current coloring is `PaintColoring` and the
   * parent mol has a non-empty selection — matches UXP `checkPaintColoring`.
   * Pre-fetched via `getRendererPaintInfo` and gated client-side.
   */
  canPaint?: boolean
  /**
   * Entries for the Style (shape) submenu (Phase 3c-3b). Pre-fetched via
   * `getRendererStyleEntries`. Both groups can be empty; the submenu is
   * hidden when both are.
   */
  rendStyle?: {
    typeStyles: { name: string; label: string; pattern: string; flags: string }[]
    edgeStyles: { name: string; label: string; pattern: string; flags: string }[]
  }
  /**
   * Current Background-color classification for the scene ctx menu's
   * "Background color" submenu (white / black radio state). Pre-fetched
   * via `getSceneBgColor`. Scene ctx only.
   */
  bgColor?: SceneBgColor
  /**
   * Current "Use color proofing" toggle state — true iff the scene has
   * `use_colproof === true` AND `icc_filename !== ""` (matches UXP
   * `onSceneMenuShowing` gate). Pre-fetched via `getSceneColorProofing`.
   * Scene ctx only.
   */
  colorProofingEnabled?: boolean
  /**
   * Whether the "Change sel" submenu should appear on the renderer ctx
   * menu — false for the `*selection` synthetic renderer (matches UXP
   * `onRendCtxtMenuShowing` `selitem.hidden` gate). Renderer ctx only.
   */
  supportsChangeSel?: boolean
  /**
   * Whether the "Generate surface obj" item should appear on the renderer
   * ctx menu. True iff the renderer is `isosurf` (matches UXP gensurfitem
   * gate). Renderer ctx only.
   */
  canGenSurfObj?: boolean
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
