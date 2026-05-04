declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.png' {
  const src: string
  export default src
}

// Shared IPC types exposed as globals using TypeScript import() type syntax.
// This works in script-mode .d.ts files without requiring export {} or declare global.
type PaneCollapseState  = import('../../shared/ipcTypes').PaneCollapseState
type LayoutState        = import('../../shared/ipcTypes').LayoutState
type UiState            = import('../../shared/ipcTypes').UiState
type FileOpenedData     = import('../../shared/ipcTypes').FileOpenedData
type FileErrorData      = import('../../shared/ipcTypes').FileErrorData
type AppPathInfo        = import('../../shared/ipcTypes').AppPathInfo
type ElectronAPI        = import('../../shared/ipcTypes').ElectronAPI
type ElectronFileFilter = import('../../shared/ipcTypes').ElectronFileFilter
type FileDialogOptions  = import('../../shared/ipcTypes').FileDialogOptions

interface Window {
  electronAPI: ElectronAPI
}
