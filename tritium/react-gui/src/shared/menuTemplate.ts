/**
 * Platform-independent menu structure shared between the Electron main process
 * (native menu) and the renderer (React MenuBar on Windows/Linux).
 */

import { IPC } from './ipcChannels'
import { APP_PRODUCT_NAME } from './appInfo'

export type AppMenuRole =
  | 'cut' | 'copy' | 'paste' | 'selectAll'
  | 'reload' | 'forceReload' | 'toggleDevTools'
  | 'resetZoom' | 'zoomIn' | 'zoomOut' | 'togglefullscreen'
  | 'about' | 'close' | 'quit'
  | 'hide' | 'hideOthers' | 'unhide' | 'services'

export interface AppMenuItem {
  id?: string
  label?: string
  /** Electron accelerator string (e.g. 'CmdOrCtrl+S'). Also used as display text in the custom menu bar. */
  accelerator?: string
  /** macOS-specific accelerator override. Main process uses this on darwin; custom menu bar ignores it. */
  acceleratorMac?: string
  /** IPC channel to send when this item is activated via the custom React menu. */
  ipcChannel?: string
  /** Native Electron role. Handled natively in the main-process menu; handled via invokeMenuRole IPC in the renderer. */
  role?: AppMenuRole
  type?: 'separator' | 'checkbox' | 'radio'
  checked?: boolean
  enabled?: boolean
  submenu?: AppMenuItem[]
  /** If true, only include in the native menu on macOS (React menu bar never shows these). */
  darwinOnly?: boolean
  /** If true, only include in the native menu on non-macOS platforms. */
  othersOnly?: boolean
}

export interface AppMenuGroup {
  label: string
  darwinOnly?: boolean
  submenu: AppMenuItem[]
}

// The canonical macOS Application menu lives in src/main/menu.ts
// ('macOnlyGroups'); it needs main-process-only role items and app.name, so it
// is not declared here. The group-level 'darwinOnly?' field and the
// '.filter(g => !g.darwinOnly)' guards in the two readers remain as harmless
// no-ops. Item-level darwinOnly / othersOnly are still live.
export const APP_MENU: AppMenuGroup[] = [
  // File menu
  {
    label: 'File',
    submenu: [
      // New Window intentionally omitted: Electron cannot host multiple OS
      // windows against a single shared libcuemol2 backend, so the UXP
      // multi-window model is not carried forward (use New Tab instead).
      { id: 'new-tab',     label: 'New Tab',           accelerator: 'CmdOrCtrl+T',       ipcChannel: IPC.MENU_NEW_TAB },
      { type: 'separator' },
      { id: 'open-file',   label: 'Open File...',      accelerator: 'CmdOrCtrl+O',       ipcChannel: IPC.MENU_OPEN_FILE },
      { id: 'get-pdb',     label: 'Get PDB...',        ipcChannel: IPC.MENU_GET_PDB },
      {
        id: 'open-recent', label: 'Open Recent',
        submenu: [
          { id: 'clear-recent', label: 'Clear Menu', ipcChannel: IPC.MENU_CLEAR_RECENT },
        ],
      },
      { type: 'separator' },
      { id: 'save-file-as',     label: 'Save File As...',      ipcChannel: IPC.MENU_SAVE_FILE_AS },
      { id: 'save-current-view', label: 'Save current view...', ipcChannel: IPC.MENU_SAVE_CURRENT_VIEW },
      { type: 'separator' },
      { id: 'close-tab',   label: 'Close Tab',         accelerator: 'CmdOrCtrl+W',       ipcChannel: IPC.MENU_CLOSE_TAB },
      { type: 'separator' },
      { id: 'open-scene',  label: 'Open Scene...',     accelerator: 'CmdOrCtrl+Shift+O', ipcChannel: IPC.MENU_OPEN_SCENE },
      { id: 'reload-scene', label: 'Reload Scene',     accelerator: 'CmdOrCtrl+R',       ipcChannel: IPC.MENU_RELOAD_SCENE },
      { id: 'save-scene',  label: 'Save Scene',        accelerator: 'CmdOrCtrl+S',       ipcChannel: IPC.MENU_SAVE },
      { id: 'save-scene-as', label: 'Save Scene As...', accelerator: 'CmdOrCtrl+Shift+S', ipcChannel: IPC.MENU_SAVE_SCENE_AS },
      { type: 'separator' },
      { role: 'quit', othersOnly: true },
    ],
  },

  // Edit menu
  {
    label: 'Edit',
    submenu: [
      { id: 'undo', label: 'Undo', accelerator: 'CmdOrCtrl+Z', acceleratorMac: 'CmdOrCtrl+Z', ipcChannel: IPC.MENU_UNDO },
      { id: 'redo', label: 'Redo', accelerator: 'CmdOrCtrl+Y', acceleratorMac: 'Shift+CmdOrCtrl+Z', ipcChannel: IPC.MENU_REDO },
      { type: 'separator' },
      // Standard clipboard items. Cut/Copy/Paste are pure roles (no ipcChannel)
      // so the main-process menu delegates them entirely to Electron, which
      // assigns the default Cmd/Ctrl accelerators and runs them natively against
      // the focused element / webContents selection. Without these on macOS the
      // keyboard shortcuts are not delivered and clipboard fails app-wide.
      { id: 'cut',   label: 'Cut',   role: 'cut' },
      { id: 'copy',  label: 'Copy',  role: 'copy' },
      { id: 'paste', label: 'Paste', role: 'paste' },
      // Select All is NOT a native role: Electron's selectAll selects the whole
      // document (every GUI text node) when focus is not in an editable field.
      // Route it through the renderer (selectAllInScope) so it targets only the
      // focused field or the active selectable region (e.g. the log panel).
      { id: 'select-all', label: 'Select All', accelerator: 'CmdOrCtrl+A', ipcChannel: IPC.MENU_SELECT_ALL },
      { type: 'separator' },
      { id: 'clear-undo', label: 'Clear undo data', ipcChannel: IPC.MENU_CLEAR_UNDO },
      { type: 'separator' },
      { id: 'merge-mol',      label: 'Merge molecule...',       ipcChannel: IPC.MENU_MERGE_MOL },
      { id: 'delete-mol-atoms', label: 'Delete mol atoms...',   ipcChannel: IPC.MENU_DELETE_MOL_ATOMS },
      { id: 'change-chain-id', label: 'Change chain ID...',     ipcChannel: IPC.MENU_CHANGE_CHAIN_ID },
      { id: 'change-resid-num', label: 'Change residue number...', ipcChannel: IPC.MENU_CHANGE_RESID_NUM },
      { type: 'separator' },
      { id: 'options', label: 'Options', accelerator: 'CmdOrCtrl+K', ipcChannel: IPC.MENU_OPTIONS, othersOnly: true },
    ],
  },

  // Rendering menu
  {
    label: 'Rendering',
    submenu: [
      // POV-Ray rendering opens the modeless Rendering window (ui.renderWindow).
      // Animation rendering will be folded into that same window as a
      // Still / Animation mode (follow-up), so it has no separate menu item.
      { id: 'pov-render',    label: 'POV-Ray rendering...',   ipcChannel: IPC.MENU_POV_RENDER },
      {
        id: 'export-scene', label: 'Export scene',
        submenu: [
          { id: 'export-png',     label: 'PNG image...',                ipcChannel: IPC.MENU_EXPORT_PNG },
          { id: 'export-umbreon', label: 'Umbreon ray-traced image...', ipcChannel: IPC.MENU_EXPORT_UMBREON },
          { id: 'export-pov',     label: 'POV-Ray SDL...',              ipcChannel: IPC.MENU_EXPORT_POV },
          { id: 'export-stl',     label: 'STL...',                      ipcChannel: IPC.MENU_EXPORT_STL },
          { id: 'export-mqo',     label: 'Metasequoia (MQO)...',        ipcChannel: IPC.MENU_EXPORT_MQO },
        ],
      },
    ],
  },

  // Scene menu
  {
    label: 'Scene',
    submenu: [
      {
        id: 'background', label: 'Background',
        submenu: [
          { id: 'bg-white', label: 'White', type: 'radio', enabled: false, ipcChannel: IPC.MENU_BG_WHITE },
          { id: 'bg-black', label: 'Black', type: 'radio', enabled: false, ipcChannel: IPC.MENU_BG_BLACK },
        ],
      },
      { type: 'separator' },
      { id: 'color-proof', label: 'Use color proofing', ipcChannel: IPC.MENU_COLOR_PROOF },
      { id: 'scene-props', label: 'Properties...', ipcChannel: IPC.MENU_SCENE_PROPS },
    ],
  },

  // View menu
  {
    label: 'View',
    submenu: [
      { id: 'view-perspective',   label: 'Perspective',   type: 'checkbox', enabled: false, ipcChannel: IPC.MENU_VIEW_PERSPECTIVE },
      { id: 'view-orthographic',  label: 'Orthographic',  type: 'checkbox', enabled: false, ipcChannel: IPC.MENU_VIEW_ORTHOGRAPHIC },
      { type: 'separator' },
      {
        id: 'center-mark', label: 'Center mark',
        submenu: [
          { id: 'center-mark-cross', label: 'Cross', type: 'radio', checked: true, enabled: false, ipcChannel: IPC.MENU_CENTER_MARK_CROSS },
          { id: 'center-mark-axis',  label: 'Axis',  type: 'radio', enabled: false, ipcChannel: IPC.MENU_CENTER_MARK_AXIS },
          { id: 'center-mark-none',  label: 'None',  type: 'radio', enabled: false, ipcChannel: IPC.MENU_CENTER_MARK_NONE },
        ],
      },
      { type: 'separator' },
      { id: 'view-props', label: 'View property...', ipcChannel: IPC.MENU_VIEW_PROPS },
      { type: 'separator' },
      { role: 'toggleDevTools' },
    ],
  },

  // Tools menu
  {
    label: 'Tools',
    submenu: [
      { id: 'mol-superpose',  label: 'Molecular superposition...',  ipcChannel: IPC.MENU_MOL_SUPERPOSE },
      // Bond editing is a viewport tool (ViewportToolPalette "Add Bond",
      // activeTool 'bondEdit'), not a modal dialog -- no menu entry needed.
      { id: 'interaction',    label: 'Interaction...',               ipcChannel: IPC.MENU_INTERACTION },
      { id: 'reassign-2ndry', label: 'Reassign secondary str...',    ipcChannel: IPC.MENU_REASSIGN_2NDRY },
      { id: 'morph-anim',     label: 'Mol morphing animation...',    ipcChannel: IPC.MENU_MORPH_ANIM },
      { id: 'mol-surf',       label: 'Mol surface generation...',    ipcChannel: IPC.MENU_MOL_SURF },
      { id: 'surf-cutter',    label: 'Mol surface cutter...',        ipcChannel: IPC.MENU_SURF_CUTTER },
      { id: 'apbs',           label: 'APBS elepot calculation...',   ipcChannel: IPC.MENU_APBS },
      { type: 'separator' },
      { id: 'exec-script',    label: 'Execute script...',            ipcChannel: IPC.MENU_EXEC_SCRIPT },
      { type: 'separator' },
      { id: 'perf-meas',      label: 'Performance measure',         ipcChannel: IPC.MENU_PERF_MEAS },
    ],
  },

  // Window menu intentionally omitted: the topbar / log / panel-layout actions
  // it hosted in UXP no longer map onto the tritium UI structure.

  // Help menu
  // Only About is carried forward; the UXP plugins / config / addon-manager /
  // console / update-check items were Mozilla-platform specific. On macOS About
  // lives in the Application menu, so this single-item group is empty there and
  // is dropped by buildAndSetMenu (empty-submenu groups are filtered out).
  {
    label: 'Help',
    submenu: [
      { id: 'about', label: `About ${APP_PRODUCT_NAME}`, ipcChannel: IPC.MENU_ABOUT, othersOnly: true },
    ],
  },
]

/**
 * Scene-export submenu item id -> StreamManager exporter nickname (category 2).
 * Used to hide an export menu item when its exporter is not compiled into the
 * running libcuemol2 build (e.g. 'umbreon' without HAVE_UMBREON). Availability
 * is probed at startup via the `getAvailableSceneExporters` worker service;
 * gating is fail-open (an empty/unknown availability set shows every item).
 */
export const SCENE_EXPORT_MENU_EXPORTERS: Readonly<Record<string, string>> = {
  'export-png': 'png',
  'export-umbreon': 'umbreon',
  'export-pov': 'pov',
  'export-stl': 'stl',
  'export-mqo': 'mqo',
}

/**
 * True when `item` is a scene-export menu item whose exporter is absent from
 * the probed availability set. `available === null` means the probe has not
 * resolved yet (or failed) -- treated as "show everything" (fail-open).
 */
export function isExportItemUnavailable(
  item: AppMenuItem,
  available: readonly string[] | null | undefined,
): boolean {
  if (!item.id || !available || available.length === 0) return false
  const exporter = SCENE_EXPORT_MENU_EXPORTERS[item.id]
  if (!exporter) return false
  return !available.includes(exporter)
}

/** Labels shown in the React custom menu bar for role-based items. */
const ROLE_LABELS: Partial<Record<AppMenuRole, string>> = {
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select All',
  reload: 'Reload',
  forceReload: 'Force Reload',
  toggleDevTools: 'Toggle Developer Tools',
  resetZoom: 'Reset Zoom',
  zoomIn: 'Zoom In',
  zoomOut: 'Zoom Out',
  togglefullscreen: 'Toggle Full Screen',
  about: 'About',
  quit: 'Quit',
  close: 'Close',
}

export function getRoleLabel(role: AppMenuRole): string {
  return ROLE_LABELS[role] ?? role
}
