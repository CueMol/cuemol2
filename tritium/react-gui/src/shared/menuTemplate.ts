/**
 * Platform-independent menu structure shared between the Electron main process
 * (native menu) and the renderer (React MenuBar on Windows/Linux).
 */

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
  type?: 'separator'
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
  {
    label: 'File',
    submenu: [
      { id: 'open-file', label: 'Open File...', accelerator: 'CmdOrCtrl+O', ipcChannel: 'menu:open-file' },
      { id: 'save',      label: 'Save',         accelerator: 'CmdOrCtrl+S', ipcChannel: 'menu:save' },
      { type: 'separator' },
      { id: 'new-tab',   label: 'New Tab',  accelerator: 'CmdOrCtrl+T', ipcChannel: 'menu:new-tab' },
      { id: 'close-tab', label: 'Close Tab', accelerator: 'CmdOrCtrl+W', ipcChannel: 'menu:close-tab' },
      { type: 'separator' },
      { role: 'close', darwinOnly: true },
      { role: 'quit',  othersOnly: true },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { id: 'undo', label: 'Undo', accelerator: 'CmdOrCtrl+Z',       acceleratorMac: 'CmdOrCtrl+Z', ipcChannel: 'menu:undo' },
      { id: 'redo', label: 'Redo', accelerator: 'CmdOrCtrl+Y',       acceleratorMac: 'Shift+CmdOrCtrl+Z', ipcChannel: 'menu:redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  },
  {
    label: 'Scene',
    submenu: [
      { id: 'new-scene',   label: 'New Scene',    ipcChannel: 'menu:new-scene' },
      { id: 'open-file2',  label: 'Open File...',  ipcChannel: 'menu:open-file' },
      { id: 'open-scene',  label: 'Open Scene...', ipcChannel: 'menu:open-scene' },
    ],
  },
  {
    label: 'Help',
    submenu: [
      { id: 'about', label: 'About CueMol', role: 'about' },
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
