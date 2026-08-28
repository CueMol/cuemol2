/**
 * @file shared/ipcTypes.ts
 * @description Transitional barrel over shared/types/*. Import the slice
 * directly; this file goes away once every importer has been rewritten.
 */

export type { PaneCollapseState, LayoutState } from './types/layout'
export type { MovieRenderPrefs, UiState } from './types/uiPrefs'
export type { ElectronFileFilter, FileDialogOptions } from './types/fileDialog'
export type { RecentFileType, RecentFileEntry } from './types/recent'
export type { FileOpenedData, FileErrorData, ShellOpenRequest } from './types/fileEvents'
export type { AppPathInfo } from './types/appPath'
export type { NaviCtxAction, NaviCtxMenuPayload } from './types/naviCtxMenu'
export type { TextCtxAction, TextEditAction, TextCtxEditFlags, TextCtxShowPayload } from './types/textCtxMenu'
export type { SelectMolKind, RendColoringStyleId, RendColoringId, ChangeRendSelKind, SceneCtxAction, SceneCtxNodeType, SceneCtxMenuPayload } from './types/sceneCtxMenu'
export type { ViewCenterMark, SceneBgColor, MenuState } from './types/menuState'
export type { CrashSource, CrashReport } from './types/crash'
export type { RenderPropDefWire, RenderSettingsSnapshotWire, RenderSourceWire, RenderJobWire, RenderFramePreviewWire, RenderResultWire, RenderTargetViewWire, RenderImageRef, RenderViewCamera, HatchStyleSpecReply, RenderWindowMode, RenderWindowOpenOptions, RenderWindowModeRequest, RenderWindowCommand, RenderWindowStateUpdate, ViewSizePx } from './types/renderWindow'
export type { CuemolClipWriteReq, CuemolClipReadRes, CuemolClipPeekRes } from './types/clipboard'
export type { ElectronAPI } from './ipcContract'
