/**
 * Platform-independent menu structure shared between the Electron main process
 * (native menu) and the renderer (React MenuBar on Windows/Linux).
 */

import { IPC } from './ipcChannels'

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

export const APP_MENU: AppMenuGroup[] = [
  // macOS Application menu (shown only on darwin)
  {
    label: 'CueMol2',
    darwinOnly: true,
    submenu: [
      { id: 'about-mac', label: 'About CueMol3-tritium', ipcChannel: IPC.MENU_ABOUT, darwinOnly: true },
      { type: 'separator' },
      { id: 'mac-prefs', label: 'Preferences...', accelerator: 'Cmd+,', ipcChannel: 'menu:options', darwinOnly: true },
      { type: 'separator' },
      { role: 'services', darwinOnly: true },
      { type: 'separator' },
      { role: 'hide', darwinOnly: true },
      { role: 'hideOthers', darwinOnly: true },
      { role: 'unhide', darwinOnly: true },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },

  // File menu
  {
    label: 'File',
    submenu: [
      { id: 'new-window',  label: 'New Window',       accelerator: 'CmdOrCtrl+Shift+N', ipcChannel: 'menu:new-window' },
      { id: 'new-tab',     label: 'New Tab',           accelerator: 'CmdOrCtrl+T',       ipcChannel: 'menu:new-tab' },
      { type: 'separator' },
      { id: 'open-file',   label: 'Open File...',      accelerator: 'CmdOrCtrl+O',       ipcChannel: 'menu:open-file' },
      { id: 'get-pdb',     label: 'Get PDB...',        ipcChannel: 'menu:get-pdb' },
      {
        id: 'open-recent', label: 'Open Recent',
        submenu: [
          { id: 'clear-recent', label: 'Clear Menu', ipcChannel: 'menu:clear-recent' },
        ],
      },
      { type: 'separator' },
      { id: 'save-file-as',     label: 'Save File As...',      ipcChannel: 'menu:save-file-as' },
      { id: 'save-current-view', label: 'Save current view...', ipcChannel: 'menu:save-current-view' },
      { type: 'separator' },
      { id: 'close-tab',   label: 'Close Tab',         accelerator: 'CmdOrCtrl+W',       ipcChannel: 'menu:close-tab' },
      { type: 'separator' },
      { id: 'open-scene',  label: 'Open Scene...',     accelerator: 'CmdOrCtrl+Shift+O', ipcChannel: 'menu:open-scene' },
      { id: 'reload-scene', label: 'Reload Scene',     accelerator: 'CmdOrCtrl+R',       ipcChannel: 'menu:reload-scene' },
      { id: 'save-scene',  label: 'Save Scene',        accelerator: 'CmdOrCtrl+S',       ipcChannel: IPC.MENU_SAVE },
      { id: 'save-scene-as', label: 'Save Scene As...', accelerator: 'CmdOrCtrl+Shift+S', ipcChannel: IPC.MENU_SAVE_SCENE_AS },
      { type: 'separator' },
      { id: 'open-webpage', label: 'Open web page...', ipcChannel: 'menu:open-webpage' },
      { type: 'separator' },
      { role: 'quit', othersOnly: true },
    ],
  },

  // Edit menu
  {
    label: 'Edit',
    submenu: [
      { id: 'undo', label: 'Undo', accelerator: 'CmdOrCtrl+Z', acceleratorMac: 'CmdOrCtrl+Z', ipcChannel: 'menu:undo' },
      { id: 'redo', label: 'Redo', accelerator: 'CmdOrCtrl+Y', acceleratorMac: 'Shift+CmdOrCtrl+Z', ipcChannel: 'menu:redo' },
      { type: 'separator' },
      { id: 'clear-undo', label: 'Clear undo data', ipcChannel: 'menu:clear-undo' },
      { type: 'separator' },
      { id: 'merge-mol',      label: 'Merge molecule...',       ipcChannel: 'menu:merge-mol' },
      { id: 'delete-mol-atoms', label: 'Delete mol atoms...',   ipcChannel: 'menu:delete-mol-atoms' },
      { id: 'change-chain-id', label: 'Change chain ID...',     ipcChannel: 'menu:change-chain-id' },
      { id: 'change-resid-num', label: 'Change residue number...', ipcChannel: 'menu:change-resid-num' },
      { type: 'separator' },
      { id: 'options', label: 'Options', accelerator: 'CmdOrCtrl+K', ipcChannel: 'menu:options', othersOnly: true },
    ],
  },

  // Rendering menu
  {
    label: 'Rendering',
    submenu: [
      { id: 'pov-render',    label: 'POV-Ray rendering...',   ipcChannel: 'menu:pov-render' },
      { id: 'anim-render',   label: 'Animation rendering...', ipcChannel: 'menu:anim-render' },
      { id: 'export-scene',  label: 'Export scene...',        ipcChannel: 'menu:export-scene' },
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
      { id: 'color-proof', label: 'Use color proofing', ipcChannel: 'menu:color-proof' },
      { id: 'scene-props', label: 'Properties...', ipcChannel: 'menu:scene-props' },
    ],
  },

  // View menu
  {
    label: 'View',
    submenu: [
      { id: 'view-perspective',   label: 'Perspective',   type: 'checkbox', enabled: false, ipcChannel: 'menu:view-perspective' },
      { id: 'view-orthographic',  label: 'Orthographic',  type: 'checkbox', enabled: false, ipcChannel: 'menu:view-orthographic' },
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
      { id: 'view-props', label: 'View property...', ipcChannel: 'menu:view-props' },
    ],
  },

  // Tools menu
  {
    label: 'Tools',
    submenu: [
      { id: 'mol-superpose',  label: 'Molecular superposition...',  ipcChannel: 'menu:mol-superpose' },
      { id: 'bond-editor',    label: 'Mol bond editor...',           ipcChannel: 'menu:bond-editor' },
      { id: 'interaction',    label: 'Interaction...',               ipcChannel: 'menu:interaction' },
      { id: 'reassign-2ndry', label: 'Reassign secondary str...',    ipcChannel: 'menu:reassign-2ndry' },
      { id: 'morph-anim',     label: 'Mol morphing animation...',    ipcChannel: 'menu:morph-anim' },
      { id: 'mol-surf',       label: 'Mol surface generation...',    ipcChannel: 'menu:mol-surf' },
      { id: 'surf-cutter',    label: 'Mol surface cutter...',        ipcChannel: 'menu:surf-cutter' },
      { id: 'apbs',           label: 'APBS elepot calculation...',   ipcChannel: 'menu:apbs' },
      { type: 'separator' },
      { id: 'exec-script',    label: 'Execute script...',            ipcChannel: 'menu:exec-script' },
      { type: 'separator' },
      { id: 'perf-meas',      label: 'Performance measure',         ipcChannel: 'menu:perf-meas' },
    ],
  },

  // Window menu
  {
    label: 'Window',
    submenu: [
      { id: 'toggle-topbar',    label: 'Show/Hide Topbar',             ipcChannel: 'menu:toggle-topbar' },
      { type: 'separator' },
      { id: 'clear-log',        label: 'Clear log contents',           ipcChannel: 'menu:clear-log' },
      { id: 'restore-panels',   label: 'Restore default panel location', ipcChannel: 'menu:restore-panels' },
    ],
  },

  // Help menu
  {
    label: 'Help',
    submenu: [
      { id: 'about', label: 'About CueMol3-tritium', ipcChannel: IPC.MENU_ABOUT, othersOnly: true },
      { type: 'separator' },
      { id: 'about-plugins',  label: 'About plugins...',  ipcChannel: 'menu:about-plugins' },
      { id: 'about-config',   label: 'About config...',   ipcChannel: 'menu:about-config' },
      { id: 'addon-mgr',      label: 'Addon manager...',  ipcChannel: 'menu:addon-mgr' },
      { type: 'separator' },
      { id: 'console',        label: 'Console',           ipcChannel: 'menu:console' },
      { id: 'check-updates',  label: 'Check for updates', ipcChannel: 'menu:check-updates' },
    ],
  },
]

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

/**
 * Convert APP_MENU to an Electron MenuItemConstructorOptions array.
 * Import only in the main process (requires 'electron').
 * @deprecated Use the recursive buildItem helper in main/menu.ts instead.
 */
export function toElectronTemplate(
  menu: AppMenuGroup[],
  isMac: boolean,
): unknown[] {
  function convertItem(item: AppMenuItem): unknown | null {
    if (item.darwinOnly && !isMac) return null
    if (item.othersOnly && isMac) return null
    if (item.type === 'separator') return { type: 'separator' }
    if (item.role && !item.ipcChannel) {
      return { role: item.role }
    }
    const result: Record<string, unknown> = {}
    if (item.label) result['label'] = item.label
    if (item.role) result['role'] = item.role
    const acc = isMac ? (item.acceleratorMac ?? item.accelerator) : item.accelerator
    if (acc) result['accelerator'] = acc
    if (item.submenu) {
      result['submenu'] = item.submenu.flatMap((i) => {
        const c = convertItem(i)
        return c ? [c] : []
      })
    }
    return result
  }

  return menu.flatMap((group) => {
    if (group.darwinOnly && !isMac) return []
    const submenu = group.submenu.flatMap((item) => {
      const c = convertItem(item)
      return c ? [c] : []
    })
    return [{ label: group.label, submenu }]
  })
}
