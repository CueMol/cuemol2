/**
 * Typed contract for all IPC channels exchanged between Electron main,
 * preload, and renderer.
 *
 * Two channel kinds are tracked:
 *   - InvokeChannels: renderer -> main, with reply (Promise)
 *   - PushChannels:   main -> renderer, no reply
 *
 * Adding a channel: extend either map below; the preload `invoke`/`onPush`
 * helpers and the main `handleInvoke` wrapper pick up the new entry through
 * the generic signatures.
 */

import { IPC } from './ipcChannels'
import type { MenuActionChannel } from './menuActionMap'
import type {
  AppPathInfo,
  CrashReport,
  FileDialogOptions,
  FileErrorData,
  FileOpenedData,
  LayoutState,
  MenuState,
  NaviCtxAction,
  NaviCtxMenuPayload,
  RecentFileEntry,
  RenderWindowCommand,
  RenderWindowStateUpdate,
  SceneCtxAction,
  SceneCtxMenuPayload,
  TextCtxAction,
  TextCtxShowPayload,
  UiState,
  ViewSizePx,
} from './ipcTypes'

export interface InvokeChannels {
  [IPC.APP_PATH]:          { req: void;                  res: AppPathInfo }
  [IPC.DIALOG_OPEN]:       { req: FileDialogOptions;     res: void }
  [IPC.DIALOG_SAVE_SCENE]: { req: { defaultName: string };
                             res: { canceled: boolean; filePath: string } }
  [IPC.DIALOG_STYLE_OPEN]: { req: void;
                             res: { canceled: boolean; filePath: string } }
  [IPC.DIALOG_STYLE_SAVE]: { req: { defaultName: string };
                             res: { canceled: boolean; filePath: string } }
  [IPC.DIALOG_CAMERA_OPEN]: { req: void;
                              res: { canceled: boolean; filePath: string } }
  [IPC.DIALOG_CAMERA_SAVE]: { req: { defaultName: string };
                              res: { canceled: boolean; filePath: string } }
  [IPC.DIALOG_SCENE_EXPORT]: { req: {
                                 defaultName: string
                                 filters: { name: string; extensions: string[] }[]
                               };
                               res: { canceled: boolean; filePath: string } }
  [IPC.DIALOG_OBJECT_SAVE]: { req: {
                                defaultDir: string
                                defaultName: string
                                filters: { name: string; extensions: string[] }[]
                                /** 0-based index into filters; selects the default filter. */
                                defaultFilterIndex?: number
                              };
                              res: { canceled: boolean; filePath: string; filterIndex: number } }
  [IPC.DIALOG_PICK_PATH]:  { req: { title: string; directory?: boolean;
                                     /** Optional open-dialog file filters (file mode only). */
                                     filters?: { name: string; extensions: string[] }[];
                                     /** Allow selecting multiple files (file mode only). */
                                     multi?: boolean };
                             res: { canceled: boolean; filePath: string;
                                     /** All selected paths (populated when `multi` is set). */
                                     filePaths?: string[] } }
  [IPC.SAVE_TEXT_AS]:      { req: {
                                defaultName: string
                                content: string
                                filters?: { name: string; extensions: string[] }[]
                              };
                              res: { canceled: boolean; filePath?: string; error?: string } }
  [IPC.FILE_EXISTS]:       { req: { path: string };      res: { exists: boolean } }
  [IPC.FILE_BACKUP_RENAME]:{ req: { path: string };
                             res: { ok: boolean; backed: boolean; error?: string } }
  [IPC.LAYOUT_LOAD]:       { req: void;                  res: LayoutState | null }
  [IPC.LAYOUT_SAVE]:       { req: LayoutState;           res: void }
  [IPC.UI_LOAD]:           { req: void;                  res: UiState }
  [IPC.UI_SAVE]:           { req: Partial<UiState>;      res: void }
  [IPC.MENU_UPDATE_STATE]: { req: MenuState;             res: void }
  [IPC.MENU_SET_MODAL_BLOCKED]: { req: boolean;          res: void }
  [IPC.RECENT_LOAD]:       { req: void;                  res: RecentFileEntry[] }
  [IPC.RECENT_ADD]:        { req: RecentFileEntry;       res: void }
  [IPC.RECENT_CLEAR]:      { req: void;                  res: void }
  [IPC.MENU_INVOKE_ROLE]:  { req: string;                res: void }
  [IPC.WINDOW_CLOSE_PROCEED]: { req: { proceed: boolean }; res: void }
  // Rendering window relay (see ipcChannels.ts for direction of each leg)
  [IPC.RENDER_WINDOW_OPEN]:    { req: void;                    res: void }
  [IPC.RENDER_WINDOW_COMMAND]: { req: RenderWindowCommand;     res: void }
  [IPC.RENDER_WINDOW_STATE]:   { req: RenderWindowStateUpdate; res: void }
  [IPC.RENDER_VIEW_SIZE_GET]:  { req: void;                    res: ViewSizePx | null }
  [IPC.RENDER_VIEW_SIZE_REPLY]: { req: { reqId: number; size: ViewSizePx | null }; res: void }
  /** Read one frame of a finished movie render back off disk (frame slider). */
  [IPC.RENDER_FRAME_READ]: { req: { outputDir: string; baseName: string; frameIndex: number }
                             res: { dataUrl: string | null } }
  [IPC.NAVI_CTX_SHOW]:     { req: NaviCtxMenuPayload;    res: NaviCtxAction | null }
  [IPC.SCENE_CTX_SHOW]:    { req: SceneCtxMenuPayload;   res: SceneCtxAction | null }
  [IPC.TEXT_CTX_ACTION]:   { req: Exclude<TextCtxAction, 'selectAll'>; res: void }
  [IPC.CRASH_REPORT]:      { req: CrashReport;           res: void }
  [IPC.FORCE_QUIT]:        { req: void;                  res: void }
}

export interface PushChannels {
  [IPC.OBJ_FILE_OPENED]:   FileOpenedData
  [IPC.SCENE_FILE_OPENED]: FileOpenedData
  [IPC.FILE_ERROR]:        FileErrorData
  [IPC.MENU_NEW_TAB]:      void
  [IPC.MENU_CLOSE_TAB]:    void
  [IPC.MENU_SAVE]:         void
  [IPC.MENU_SAVE_SCENE_AS]: void
  [IPC.MENU_NEW_SCENE]:    void
  [IPC.MENU_OPEN_FILE]:    void
  [IPC.MENU_OPEN_SCENE]:   void
  [IPC.MENU_UNDO]:         void
  [IPC.MENU_REDO]:         void
  // Payload is a known menu-action channel key (typed against menuActionMap)
  // so a typo'd channel becomes a compile error at every send / receive site.
  [IPC.MENU_GENERIC]:      MenuActionChannel
  [IPC.ROTATE_GESTURE]:    number
  [IPC.WINDOW_CLOSE_REQUEST]: void
  [IPC.MENU_OPEN_RECENT]:  RecentFileEntry
  [IPC.RECENT_UPDATED]:    RecentFileEntry[]
  [IPC.TEXT_CTX_SHOW]:     TextCtxShowPayload
  // Rendering window relay
  [IPC.RENDER_WINDOW_EXEC]:       RenderWindowCommand
  [IPC.RENDER_WINDOW_STATE_PUSH]: RenderWindowStateUpdate
  [IPC.RENDER_VIEW_SIZE_REQUEST]: { reqId: number }
}

export type InvokeChannel = keyof InvokeChannels
export type PushChannel = keyof PushChannels

export type InvokeReq<C extends InvokeChannel> = InvokeChannels[C]['req']
export type InvokeRes<C extends InvokeChannel> = InvokeChannels[C]['res']
export type PushPayload<C extends PushChannel> = PushChannels[C]

/** Variadic argument list for `invoke`: void requests take no arg. */
export type InvokeArgs<C extends InvokeChannel> = InvokeReq<C> extends void
  ? []
  : [InvokeReq<C>]

/** Callback signature for `onPush`: void payloads receive no argument. */
export type PushCallback<C extends PushChannel> = PushPayload<C> extends void
  ? () => void
  : (payload: PushPayload<C>) => void

/** The contextBridge API exposed on `window.electronAPI`. */
export interface ElectronAPI {
  /** Operating-system platform string (forwarded from `process.platform`). */
  platform: string

  /** Send an invoke request to main and await the typed response. */
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeRes<C>>

  /**
   * Subscribe to a push channel. Returns an unsubscribe function.
   * The callback shape matches the channel's payload type.
   */
  onPush<C extends PushChannel>(channel: C, callback: PushCallback<C>): () => void
}
