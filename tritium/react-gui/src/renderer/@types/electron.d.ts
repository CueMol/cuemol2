declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

interface FileOpenedData {
  name: string
  path: string
  content: string
}

interface FileErrorData {
  path: string
  error: string
}

interface LayoutState {
  mainSizes?: number[]
  rightPanelSizes?: number[]
  centerSizes?: number[]
  sidebarOpen?: boolean
  inspectorOpen?: boolean
  explorerSizes?: number[]
  explorerCollapsed?: Record<string, boolean>
  selectionSizes?: number[]
  selectionCollapsed?: Record<string, boolean>
}

interface UiState {
  sidebarActiveView?: string
  selectionMolId?: string
  theme?: 'dark' | 'light'
}

interface AppPathInfo {
  appPath: string
  exePath: string
  modulePath: string
  isPackaged: boolean
  sysConfigPath: string
}

interface ElectronAPI {
  platform: string
  getAppPathInfo: () => Promise<AppPathInfo>
  openFile: () => Promise<void>
  onFileOpened: (callback: (data: FileOpenedData) => void) => () => void
  onFileError: (callback: (data: FileErrorData) => void) => () => void
  onMenuNewTab: (callback: () => void) => () => void
  onMenuCloseTab: (callback: () => void) => () => void
  onMenuSave: (callback: () => void) => () => void
  onMenuNewScene: (callback: () => void) => () => void
  loadLayout: () => Promise<LayoutState>
  saveLayout: (state: LayoutState) => Promise<void>
  loadUi: () => Promise<UiState>
  saveUi: (state: Partial<UiState>) => Promise<void>
}

interface Window {
  electronAPI: ElectronAPI
}
