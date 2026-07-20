/**
 * Shared types for IPC communication between Electron main, preload, and renderer.
 *
 * This is the single source of truth for all data structures that cross
 * process boundaries. Import from here instead of defining locally.
 */

// - Layout -

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

// - UI preferences -

/** Miscellaneous UI preferences exchanged with the main process. */
export interface UiState {
  sidebarActiveView?: string
  selectionMolId?: string
  theme?: 'dark' | 'light'
  /**
   * Pointing-device preference for 3D navigation. Selects which ViewInputConfig
   * style is applied (mouse: wheel zooms; trackpad: two-finger scroll pans,
   * pinch zooms). 'auto' detects the device from the wheel-event stream.
   * Defaults to 'auto'.
   */
  inputDeviceMode?: 'mouse' | 'trackpad' | 'auto'
  /**
   * Last device the 'auto' preference resolved to. Persisted so an auto session
   * starts with the previously-detected preset instead of always seeding mouse.
   */
  inputDeviceDetected?: 'mouse' | 'trackpad'
  /** POV-Ray executable path (Rendering settings). */
  povrayExe?: string
  /** POV-Ray include directory path (Rendering settings). */
  povrayInc?: string
  /** blendpng executable path (Rendering settings). */
  blendpng?: string
  /** APBS executable path (External Tools settings). */
  apbsExe?: string
  /** pdb2pqr executable path (External Tools settings). */
  pdb2pqrExe?: string
  /** Default pdb2pqr force field (External Tools settings). */
  pdb2pqrFF?: string
}

// - File dialog -

export interface ElectronFileFilter {
  name: string
  extensions: string[]
}

export interface FileDialogOptions {
  dialogType: 'open-obj' | 'open-scene'
  filters: ElectronFileFilter[]
}

// - Recent files (MRU) -

/**
 * Whether a MRU entry should be re-opened as a coordinate / object file
 * (mol/pdb/cif/...) or as a scene file (.qsc). The distinction drives
 * which CmdId is dispatched on click. UXP `mru-files.js` stores the
 * concrete reader_name (`pdb`, `mol2`, `qsc_xml`, ...); the tritium load
 * paths auto-detect the reader from the file extension, so a coarse
 * obj/scene flag is sufficient here.
 */
export type RecentFileType = 'obj' | 'scene'

export interface RecentFileEntry {
  path: string
  ftype: RecentFileType
  /**
   * Obj reader nickname this file was opened with (e.g. 'pdb', 'mmcif').
   * Persisted so reopening from the MRU reuses the same reader instead of
   * re-sniffing (UXP `mru-files` `ftype` parity). Undefined for scene files
   * and for legacy entries saved before this field existed.
   */
  readerName?: string
}

// - File events -

export interface FileOpenedData {
  name: string
  path: string
  /**
   * Whether the worker should pick the object reader purely from file
   * content. Inferred in the main process by inspecting the file
   * dialog's filter list against the selected path:
   *   - exactly one specific filter matches the extension -> false
   *     (the user picked that filter; extension is authoritative)
   *   - multiple specific filters match, only catch-all filters
   *     match, or no match at all -> true (let the C++ side sniff).
   * Always false for scene files (.qsc).
   */
  contentFirst: boolean
  /**
   * Explicit obj reader nickname to use, bypassing content/extension sniff.
   * Set when reopening from the MRU (the reader the file was first opened
   * with). Undefined for a fresh File > Open (reader resolved by sniff).
   */
  readerName?: string
}

export interface FileErrorData {
  path: string
  error: string
}

// - App path -

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
  /**
   * Default external render-binary paths resolved by Main (getRenderBinaries).
   * Packaged builds resolve from the install tree (process.resourcesPath); dev
   * builds resolve from the LIBCUEMOL2_ROOT / BUNDLE_APPS env vars the Taskfile
   * run task exports. A field is the empty string when its source is unset, so
   * the renderer falls back to the compiled-in DEFAULT_RENDER_BINARIES. Mirrors
   * the RenderBinaries shape (renderer/worker/shared/renderTypes).
   */
  defaultRenderBinaries: {
    povrayExe: string
    povrayInc: string
    blendpng: string
  }
  /**
   * Default APBS / pdb2pqr executable paths resolved by Main (getApbsBinaries).
   * Same resolution strategy as defaultRenderBinaries: packaged builds resolve
   * from the bundled `bundle_apps/apbs` tree under process.resourcesPath (staged
   * by tritium/packaging/collect-cuemol2-runtime.sh), dev builds from the
   * BUNDLE_APPS env var. A field is the empty string when its source is unset,
   * so the renderer falls back to the compiled-in DEFAULT_APBS_BINARIES. Mirrors
   * the ApbsBinaries shape (renderer/worker/shared/apbsTypes).
   */
  defaultApbsBinaries: {
    apbsExe: string
    pdb2pqrExe: string
  }
}

// - Native viewport context menu -

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

// - Text clipboard context menu (editable fields / selectable text) -

/** Edit-role picked from the text clipboard context menu. */
export type TextCtxAction = 'cut' | 'copy' | 'paste' | 'selectAll'

/** Subset of Electron's `ContextMenuParams.editFlags` the menu consumes. */
export interface TextCtxEditFlags {
  canCut: boolean
  canCopy: boolean
  canPaste: boolean
  canSelectAll: boolean
}

/**
 * Push payload for the Windows/Linux React text context menu: the
 * right-click position plus the `webContents 'context-menu'` params the
 * template builder needs.
 */
export interface TextCtxShowPayload {
  x: number
  y: number
  isEditable: boolean
  selectionText: string
  editFlags: TextCtxEditFlags
}

// - Scene-tree context menu (ScenePane right-click) -

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
  // Around (atom-level) and Around by-residue (`byres` expansion) of the
  // current mol selection -- UXP `ws.aroundMolSel(dist, byres)` /
  // `cuemolui.molSelAround`. No-op when the current selection is empty.
  | 'around3'
  | 'around5'
  | 'around7'
  | 'around10'
  | 'aroundByres3'
  | 'aroundByres5'
  | 'aroundByres7'
  | 'aroundByres10'

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
  | 'paint-type-paint'
  | 'paint-type-cpk'
  | 'paint-type-solid'
  | 'paint-type-elepot'
  | 'paint-type-resetdef'

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
 * action arguments -- `selectMol` carries the chosen submenu item.
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
  | { kind: 'editInteractionList' }
  | { kind: 'newRendGroup' }
  | { kind: 'newRenderer' }
  | { kind: 'editRendStyle' }
  | { kind: 'createRendStyle' }
  | { kind: 'saveAsObject' }
  | { kind: 'changeRendType'; typeName: string }
  | { kind: 'newStyle' }
  | { kind: 'editStyle' }
  | { kind: 'styleLoad' }
  | { kind: 'styleReload' }
  | { kind: 'styleSave' }
  | { kind: 'styleSaveAs' }
  | { kind: 'styleToggleReadOnly' }
  | { kind: 'newCamera' }
  | { kind: 'cameraLoad' }
  | { kind: 'cameraReload' }
  | { kind: 'cameraSave' }
  | { kind: 'cameraSaveAs' }
  | { kind: 'cameraSaveFromView'; withVisFlags: boolean }
  | { kind: 'cameraApplyToView'; withVisFlags: boolean }
  | { kind: 'cameraEditVisFlags' }
  | { kind: 'cameraClearVisFlags' }
  | { kind: 'multiShow' }
  | { kind: 'multiHide' }
  | { kind: 'multiDelete' }

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
  clipboardKind: 'object' | 'renderer' | 'style' | 'camera' | null
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
   * parent mol has a non-empty selection -- matches UXP `checkPaintColoring`.
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
   * Current "Use color proofing" toggle state -- true iff the scene has
   * `use_colproof === true` AND `icc_filename !== ""` (matches UXP
   * `onSceneMenuShowing` gate). Pre-fetched via `getSceneColorProofing`.
   * Scene ctx only.
   */
  colorProofingEnabled?: boolean
  /**
   * Whether the "Change sel" submenu should appear on the renderer ctx
   * menu -- false for the `*selection` synthetic renderer (matches UXP
   * `onRendCtxtMenuShowing` `selitem.hidden` gate). Renderer ctx only.
   */
  supportsChangeSel?: boolean
  /**
   * Whether the "Generate surface obj" item should appear on the renderer
   * ctx menu. True iff the renderer is `isosurf` (matches UXP gensurfitem
   * gate). Renderer ctx only.
   */
  canGenSurfObj?: boolean
  /**
   * Whether the "Edit interaction list..." item should appear on the renderer
   * ctx menu. True iff the renderer is `atomintr` (UXP `aintr-edit` dialog).
   * Renderer ctx only.
   */
  canEditInteractions?: boolean
  /**
   * Selectable type names for the "Change type" submenu on the renderer
   * ctx menu (Phase 6b). Pre-fetched via `getRendererChangeTypes` --
   * an empty list hides the submenu and is the only signal the main
   * process uses (it does not re-evaluate gates).
   */
  rendChangeTypes?: string[]
  /**
   * Multi-select context (Phase 4c). When `multiNodeIds.length > 1` AND
   * the right-clicked node is in the set, main renders the multi-only
   * menu (Show / Hide / Delete) instead of the type-specific branch.
   */
  multiNodeIds?: number[]
  /**
   * Style-node pre-fetch (Phase 5c). Drives the Reload (has src) / Save
   * (has src) / Read-only check + disable / Copy disable on global rows
   * gates in the style ctxmenu. Style ctx only.
   */
  styleInfo?: {
    /** Scope id -- 0 for global, scene.uid for scene-local. */
    scopeId: number
    src: string
    readonly: boolean
    modified: boolean
  }
  /**
   * Camera-node pre-fetch (Phase 5b). Drives Reload (has src) / Clear
   * vis flags (vis_size > 0) gates. Camera ctx only.
   */
  cameraInfo?: {
    src: string
    visSize: number
  }
}

// - Native menu state -

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
  undo?: {
    enabled: boolean
  }
  redo?: {
    enabled: boolean
  }
  /**
   * Enablement of menu items that act on an existing scene (Save / Save As /
   * Export / Reload / molecule tools, ...). Disabled when no molview tab is
   * active so they read as unavailable instead of silently doing nothing.
   */
  sceneOps?: {
    enabled: boolean
  }
  /**
   * Scene-exporter availability for the running libcuemol2 build: the set of
   * exporter nicknames registered in category 2. Export menu items whose
   * exporter is absent are hidden. An empty array is treated as "unknown" and
   * hides nothing (fail-open); pushed once at startup after the worker probe.
   */
  exportCaps?: {
    available: string[]
  }
}

// - Crash report -

/**
 * Where a crash originated. Names a concrete crash source so the main
 * process can route different severities differently if needed and so the
 * fallback UI can label what blew up.
 */
export type CrashSource =
  | 'worker-global'
  | 'worker-message'
  | 'worker-render-loop'
  | 'window-error'
  | 'window-unhandledrejection'
  | 'react-error-boundary'

/**
 * Crash payload forwarded from renderer to main via `IPC.CRASH_REPORT`.
 * `stack` is optional because native (C++) crashes may surface without a
 * usable JS stack -- the UI must tolerate its absence.
 */
export interface CrashReport {
  source: CrashSource
  message: string
  stack?: string
  filename?: string
  lineno?: number
  colno?: number
  /** React's componentStack -- only set when source === 'react-error-boundary'. */
  componentStack?: string
  /** Millisecond epoch at the renderer; preserved across IPC. */
  timestamp: number
}

// - Render window (modeless child) relay -
//
// The Rendering window is a separate renderer process with no CueMol worker;
// it talks to the main window (which owns the worker) through the main
// process. These wire types mirror the renderer-side shapes in
// data/renderResult.ts / data/rendererProperties.ts / hooks/useRenderJob.ts
// structurally (string unions widened where convenient); the main process
// only relays them opaquely and the renderer casts at the hook boundary.

/** Property definition snapshot carried over the render-window wire. */
export interface RenderPropDefWire {
  key: string
  label: string
  type: string
  value: string | number | boolean
  readonly?: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
  decimals?: number
  options?: string[]
  group: string
}

/** Frozen render-settings snapshot (mirrors RenderSettingsSnapshot). */
export interface RenderSettingsSnapshotWire {
  /** "still" or "movie" (mirrors RenderMode). */
  mode: string
  backend: string
  commonProps: RenderPropDefWire[]
  backendProps: RenderPropDefWire[]
  /** Movie settings (mirrors MovieSettings); absent for a still render. */
  movie?: {
    outputDir: string
    baseName: string
    fps: number
    makeMovie: boolean
    movieFormat: string
    dupLastFrame: boolean
    bitrateKbps: number
  }
}

/** Scene/view a render was started from (mirrors RenderSource). */
export interface RenderSourceWire {
  sceneId: number
  sceneName: string
  viewId?: number
}

/** Render job state pushed to the render window (mirrors RenderJob). */
export interface RenderJobWire {
  jobId: string
  status: string
  progress: number
  phase: string
  log: string[]
  startedAt: number
  finishedAt?: number
  source?: RenderSourceWire
}

/** Completed render pushed to the render window (mirrors RenderResult). */
export interface RenderResultWire {
  id: string
  imageDataUrl: string
  width: number
  height: number
  elapsedSec: number
  sourceSceneId: number
  sourceSceneName: string
  sourceViewId?: number
  settingsSnapshot: RenderSettingsSnapshotWire
}

/** A renderable target (an open molview) offered in the target dropdown. */
export interface RenderTargetViewWire {
  viewId: number
  sceneId: number
  /** Scene display name (tab title with the view suffix stripped). */
  sceneName: string
  /** Dropdown label (the molview tab title, e.g. "1CRN:0"). */
  title: string
}

/** Command sent by the render window; forwarded verbatim to the main window. */
export type RenderWindowCommand =
  /** Start a render. `source` set = the render window's selected target (or
   * a re-render); otherwise the main window falls back to its active view. */
  | { type: 'start'; snapshot: RenderSettingsSnapshotWire; source?: RenderSourceWire }
  | { type: 'cancel' }
  /** Switch the main window to the latest result's source molview tab. */
  | { type: 'show-source' }
  /** Request a full state re-push (sent by the render window on mount). */
  | { type: 'sync' }

/**
 * State pushed to the render window. Split into variants so the multi-MB
 * result image is sent once per completed render, never per progress tick.
 */
export type RenderWindowStateUpdate =
  | {
      kind: 'context'
      job: RenderJobWire | null
      /** Open molviews selectable as render targets. */
      views: RenderTargetViewWire[]
      /** The main window's active molview, or null when none is active. */
      activeViewId: number | null
      /**
       * Whether the umbreon render backend is compiled into this libcuemol2
       * build (probed in the main window via getAvailableSceneExporters). The
       * render window has no worker, so it learns this only from this push.
       */
      umbreonAvailable: boolean
    }
  | { kind: 'result'; result: RenderResultWire | null }

/** Pixel size of the main window's molview canvas ("Current view" preset). */
export interface ViewSizePx {
  width: number
  height: number
}

// - ElectronAPI -
// The ElectronAPI interface lives in ./ipcContract (it's defined in terms of
// the InvokeChannels / PushChannels maps). Re-exported here for convenience.

export type { ElectronAPI } from './ipcContract'
