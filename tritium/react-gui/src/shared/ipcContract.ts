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
import type { LayoutState } from './types/layout'
import type { UiState } from './types/uiPrefs'
import type { FileDialogOptions } from './types/fileDialog'
import type { RecentFileEntry } from './types/recent'
import type { FileErrorData, FileOpenedData, ShellOpenRequest } from './types/fileEvents'
import type { AppPathInfo } from './types/appPath'
import type { NaviCtxAction, NaviCtxMenuPayload } from './types/naviCtxMenu'
import type { TextEditAction, TextCtxShowPayload } from './types/textCtxMenu'
import type { SceneCtxAction, SceneCtxMenuPayload } from './types/sceneCtxMenu'
import type { MenuState } from './types/menuState'
import type { CrashReport } from './types/crash'
import type {
  RenderWindowCommand, RenderWindowModeRequest, RenderWindowOpenOptions,
  RenderWindowStateUpdate, RenderImageRef,
  RelayGetPayload, RelayReplyPayload, RelayRequestPayload, RelayKind, RelayRes,
} from './types/renderWindow'
import type { CuemolClipWriteReq, CuemolClipReadRes, CuemolClipPeekRes } from './types/clipboard'

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
  [IPC.SHELL_OPEN_PATH]:   { req: { path: string };      res: { ok: boolean; error?: string } }
  [IPC.SHELL_FILES_TAKE]:  { req: void;                  res: ShellOpenRequest }
  [IPC.SHELL_REVEAL_PATH]: { req: { path: string };      res: { ok: boolean } }
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
  [IPC.WINDOW_FOCUS_MAIN]: { req: void;                  res: void }
  [IPC.WINDOW_SET_TITLE]:  { req: { subtitle: string }; res: void }
  // Rendering window relay (see ipcChannels.ts for direction of each leg)
  [IPC.RENDER_WINDOW_OPEN]:    { req: RenderWindowOpenOptions; res: void }
  [IPC.RENDER_WINDOW_COMMAND]: { req: RenderWindowCommand;     res: void }
  [IPC.RENDER_WINDOW_STATE]:   { req: RenderWindowStateUpdate; res: void }
  /**
   * Ask the main window a question it alone can answer (RelayKinds). The
   * response is the union of every kind's result; `relayGet` in
   * useRenderWindowClient narrows it back to the kind that was asked.
   */
  [IPC.RENDER_RELAY_GET]:   { req: RelayGetPayload; res: RelayRes<RelayKind> }
  [IPC.RENDER_RELAY_REPLY]: { req: RelayReplyPayload; res: void }
  /**
   * Archive a finished render's PNG under its result id (main window -> main).
   * `workDir` is the job's temp directory when it is one the app should clean
   * up with the history; a movie's frames live in the user's own folder and
   * are not reported.
   */
  [IPC.RENDER_HISTORY_STORE]: {
    req: { resultId: string; sourcePath: string; workDir?: string }
    res: { ok: boolean }
  }
  /** Drop every archived render and the work directories they came from. */
  [IPC.RENDER_HISTORY_CLEAR]: { req: void; res: void }
  /** Read an archived render back for display (render window -> main). */
  [IPC.RENDER_HISTORY_READ]: { req: { resultId: string }; res: { dataUrl: string | null } }
  /** Write the shown render to a file the user picks. */
  [IPC.RENDER_IMAGE_SAVE]: {
    req: { ref: RenderImageRef; defaultName: string }
    res: { canceled: boolean; filePath?: string; error?: string }
  }
  /** Put the shown render on the system clipboard. */
  [IPC.RENDER_IMAGE_COPY]: { req: { ref: RenderImageRef }; res: { ok: boolean; error?: string } }
  /** Read one frame of a finished movie render back off disk (frame slider). */
  [IPC.RENDER_FRAME_READ]: { req: { outputDir: string; baseName: string; frameIndex: number }
                             res: { dataUrl: string | null } }
  /** Count the contiguous rendered frames on disk (enables the re-encode button). */
  [IPC.RENDER_FRAMES_CHECK]: { req: { outputDir: string; baseName: string }
                               res: { frameCount: number } }
  /** Delete the rendered frame images and any encoded movie for a base name. */
  [IPC.RENDER_FRAMES_CLEANUP]: { req: { outputDir: string; baseName: string }
                                 res: { ok: boolean; deleted: number } }
  /**
   * The app-managed movie output folder for this run, created on first ask.
   * The default output location, so a movie render needs no setup at all
   * (see main/movieOutput.ts for its lifetime).
   */
  [IPC.RENDER_MOVIE_TEMPDIR]: { req: void; res: { dir: string } }
  /**
   * Copy an encoded movie to a file the user picks. The counterpart of
   * RENDER_IMAGE_SAVE for the movie: with the temporary folder as the default
   * output, this is how a movie is kept beyond the sweep.
   */
  [IPC.RENDER_MOVIE_SAVE]: {
    req: { moviePath: string; defaultName: string }
    res: { canceled: boolean; filePath?: string; error?: string }
  }
  /**
   * CueMol clipboard. WRITE / READ move the payload; PEEK reports only what
   * is on the clipboard, so a context menu can gate Paste without pulling a
   * multi-megabyte object payload across the boundary.
   */
  [IPC.CLIPBOARD_CUEMOL_WRITE]: {
    req: CuemolClipWriteReq
    res: { ok: boolean; error?: string }
  }
  [IPC.CLIPBOARD_CUEMOL_READ]:  { req: void; res: CuemolClipReadRes }
  [IPC.CLIPBOARD_CUEMOL_PEEK]:  { req: void; res: CuemolClipPeekRes }
  [IPC.NAVI_CTX_SHOW]:     { req: NaviCtxMenuPayload;    res: NaviCtxAction | null }
  [IPC.SCENE_CTX_SHOW]:    { req: SceneCtxMenuPayload;   res: SceneCtxAction | null }
  [IPC.TEXT_CTX_ACTION]:   { req: TextEditAction;         res: void }
  [IPC.CRASH_REPORT]:      { req: CrashReport;           res: void }
  [IPC.FORCE_QUIT]:        { req: void;                  res: void }
}

export interface PushChannels {
  [IPC.SHELL_FILES_PENDING]: void
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
  [IPC.RENDER_WINDOW_MODE_PUSH]:  RenderWindowModeRequest
  [IPC.RENDER_RELAY_REQUEST]:     RelayRequestPayload
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

  /**
   * Resolve the on-disk path of a File dragged in from the OS
   * (Electron webUtils.getPathForFile). Returns '' for a File that
   * does not originate from the filesystem.
   */
  getPathForFile(file: File): string
}
