/// <reference types="vite/client" />
// Pulls in Vite's ImportMeta augmentation, which is what types
// `import.meta.glob` -- used by worker/server/services/index.ts to
// auto-register the service modules.

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.png' {
  const src: string
  export default src
}

// Compile-time flag for developer-only UI (currently the Component Catalog
// activity-bar view). Substituted by the `define` entry in
// electron.vite.config.ts / vitest.config.ts: true for developer builds and
// tests, false when packaging/package.sh builds a release (CUEMOL_RELEASE=1).
declare const __DEV_UI__: boolean

// Shared IPC types exposed as globals using TypeScript import() type syntax.
// This works in script-mode .d.ts files without requiring export {} or declare global.
type PaneCollapseState  = import('../../shared/types/layout').PaneCollapseState
type LayoutState        = import('../../shared/types/layout').LayoutState
type UiState            = import('../../shared/types/uiPrefs').UiState
type FileOpenedData     = import('../../shared/types/fileEvents').FileOpenedData
type FileErrorData      = import('../../shared/types/fileEvents').FileErrorData
type AppPathInfo        = import('../../shared/types/appPath').AppPathInfo
type ElectronAPI        = import('../../shared/ipcContract').ElectronAPI
type ElectronFileFilter = import('../../shared/types/fileDialog').ElectronFileFilter
type FileDialogOptions  = import('../../shared/types/fileDialog').FileDialogOptions

interface Window {
  electronAPI: ElectronAPI
}
