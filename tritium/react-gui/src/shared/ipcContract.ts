/**
 * Typed contract for all IPC channels exchanged between Electron main,
 * preload, and renderer.
 *
 * Two channel kinds are tracked:
 *   - InvokeChannels: renderer → main, with reply (Promise)
 *   - PushChannels:   main → renderer, no reply
 *
 * Adding a channel: extend either map below; the preload `invoke`/`onPush`
 * helpers and the main `handleInvoke` wrapper pick up the new entry through
 * the generic signatures.
 */

import { IPC } from './ipcChannels'
import type {
  AppPathInfo,
  FileDialogOptions,
  FileErrorData,
  FileOpenedData,
  LayoutState,
  MenuState,
  NaviCtxAction,
  NaviCtxMenuPayload,
  RecentFileEntry,
  SceneCtxAction,
  SceneCtxMenuPayload,
  UiState,
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
  [IPC.DIALOG_OBJECT_SAVE]: { req: {
                                defaultDir: string
                                defaultName: string
                                filters: { name: string; extensions: string[] }[]
                                /** 0-based index into filters; selects the default filter. */
                                defaultFilterIndex?: number
                              };
                              res: { canceled: boolean; filePath: string; filterIndex: number } }
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
  [IPC.APP_QUIT_PROCEED]:  { req: void;                  res: void }
  [IPC.NAVI_CTX_SHOW]:     { req: NaviCtxMenuPayload;    res: NaviCtxAction | null }
  [IPC.SCENE_CTX_SHOW]:    { req: SceneCtxMenuPayload;   res: SceneCtxAction | null }
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
  [IPC.MENU_GENERIC]:      string
  [IPC.ROTATE_GESTURE]:    number
  [IPC.APP_QUIT_REQUEST]:  void
  [IPC.MENU_OPEN_RECENT]:  RecentFileEntry
  [IPC.RECENT_UPDATED]:    RecentFileEntry[]
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
