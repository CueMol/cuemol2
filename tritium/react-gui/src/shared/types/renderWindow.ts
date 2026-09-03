/**
 * @file shared/types/renderWindow.ts
 * @description Wire types relayed between the main window and the modeless Rendering window.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 *
 * The Rendering window is a separate renderer process with no CueMol worker;
 * it talks to the main window (which owns the worker) through the main
 * process. These wire types mirror the renderer-side shapes in
 * data/renderResult.ts / data/rendererProperties.ts / hooks/useRenderJob.ts
 * structurally (string unions widened where convenient); the main process
 * only relays them opaquely and the renderer casts at the hook boundary.
 */

/** Property definition snapshot carried over the render-window wire. */
export interface RenderPropDefWire {
  key: string
  label: string
  type: string
  value: string | number | boolean
  readonly?: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
  decimals?: number
  options?: string[]
  group: string
}

/** Frozen render-settings snapshot (mirrors RenderSettingsSnapshot). */
export interface RenderSettingsSnapshotWire {
  /** "still" or "movie" (mirrors RenderMode). */
  mode: string
  backend: string
  commonProps: RenderPropDefWire[]
  backendProps: RenderPropDefWire[]
  /** Edited NPR hatch look as spec text (mirrors RenderHatchSnapshot). */
  hatch?: { layersSpec: string; toneSpec: string }
  /** Movie settings (mirrors MovieSettings); absent for a still render. */
  movie?: {
    outputDir: string
    baseName: string
    fps: number
    makeMovie: boolean
    movieFormat: string
    dupLastFrame: boolean
    bitrateKbps: number
  }
}

/**
 * Flat render settings as the scene stores them (Scene app data "render", a
 * C++ `RenderSettings` object): one entry per setting key, typed as C++ holds
 * it -- boolean, number (integer / real) or string (every option-typed
 * setting). Produced and consumed by renderer/features/render/sceneRenderSettings.ts.
 */
export type RenderSettingsValues = Record<string, string | number | boolean>

/**
 * Reply of the scene-settings round trip and result of the worker's
 * `getSceneRenderSettings`: `exists: false` means the scene holds no
 * RenderSettings yet (the editor shows its defaults).
 */
export type SceneRenderSettingsReply =
  | {
      ok: true
      /** Whether the scene holds a RenderSettings of its own (false: `values` are a fresh object's). */
      exists: boolean
      /** Every stored key, from the C++ object (the class defaults where nothing was set). */
      values: RenderSettingsValues
      /** The class defaults in the same shape, the fallback of a value the editor cannot show. */
      defaults: RenderSettingsValues
    }
  | { ok: false; error: string }

/** Scene/view a render was started from (mirrors RenderSource). */
export interface RenderSourceWire {
  sceneId: number
  sceneName: string
  viewId?: number
}

/** Render job state pushed to the render window (mirrors RenderJob). */
export interface RenderJobWire {
  jobId: string
  /** Progress of the whole job (all frames, for a movie). */
  progress: number
  status: string
  phase: string
  log: string[]
  startedAt: number
  finishedAt?: number
  source?: RenderSourceWire
  /** Failure message, present when status is "error". */
  error?: string
  /** Movie mode: 0-based index of the frame being rendered. */
  frameIndex?: number
  /** Movie mode: total number of frames. */
  frameCount?: number
  /** Movie mode: progress of the current frame alone. */
  frameProgress?: number
}

/** Live preview of a finished movie frame (mirrors the worker's push). */
export interface RenderFramePreviewWire {
  dataUrl: string
  width: number
  height: number
  frameIndex: number
}

/**
 * Completed render pushed to the render window (mirrors RenderResult).
 *
 * Metadata only: the rendered image is archived on disk by the main process
 * under `id` and read back for the entry on screen, so a whole history can be
 * pushed without moving megabytes.
 */
export interface RenderResultWire {
  id: string
  width: number
  height: number
  elapsedSec: number
  sourceSceneId: number
  sourceSceneName: string
  sourceViewId?: number
  settingsSnapshot: RenderSettingsSnapshotWire
}

/** A renderable target (an open molview) offered in the target dropdown. */
export interface RenderTargetViewWire {
  viewId: number
  sceneId: number
  /** Scene display name (tab title with the view suffix stripped). */
  sceneName: string
  /** Dropdown label (the molview tab title, e.g. "1CRN:0"). */
  title: string
}

/**
 * Which rendered image an export acts on.
 *
 * A still (and a movie's stand-in image) is the archived render, named by
 * result id; the frame slider instead shows a frame straight out of the user's
 * own output folder, so exporting what is on screen has to name that file.
 */
export type RenderImageRef =
  | { kind: 'result'; resultId: string }
  | { kind: 'frame'; outputDir: string; baseName: string; frameIndex: number }

/**
 * Camera-ish settings of a render target view, used to default the Rendering
 * window's Camera settings to what the target view currently shows.
 *
 * Only settings with a real counterpart are carried: the view's stereo mode is
 * a DISPLAY mode (parallel / cross / hardware) while the render stereo picks
 * an eye to render, so the two do not correspond and stereo is left alone.
 */
export interface RenderViewCamera {
  /** True = perspective projection, false = orthographic. */
  perspective: boolean
}

/**
 * Reply of the hatch-style template round trip: a style name resolved to
 * umbreon's spec text by the main window's worker (the render window has no
 * worker of its own). `ok: false` carries the reason (unknown style, a build
 * without umbreon, a timeout).
 */
export type HatchStyleSpecReply =
  | { ok: true; spec: string }
  | { ok: false; error: string }

/** Output mode of the Rendering window (mirrors renderer-side RenderMode). */
export type RenderWindowMode = 'still' | 'movie'

/** Payload of RENDER_WINDOW_OPEN. */
export interface RenderWindowOpenOptions {
  /**
   * Activate this output mode once the window is up. Omitted (the Toolbar
   * Render button, Window > Rendering Window) leaves the mode as it was.
   */
  mode?: RenderWindowMode
}

/** Payload of RENDER_WINDOW_MODE_PUSH: the mode the window must switch to. */
export interface RenderWindowModeRequest {
  mode: RenderWindowMode
  /**
   * Bumped per request so re-picking the mode the window is already in still
   * reads as a new request on the render-window side.
   */
  seq: number
}

/**
 * Payload of RENDER_WINDOW_EDIT_PUSH: an Edit-menu action whose key the
 * native menu received while the Rendering window was focused (macOS; on
 * Windows / Linux the window's own keydown listener produces the same
 * action). The window routes it by focus: a text field gets the native edit,
 * otherwise the target scene's undo / redo.
 */
export interface RenderWindowEditAction {
  action: 'undo' | 'redo'
}

/** Command sent by the render window; forwarded verbatim to the main window. */
export type RenderWindowCommand =
  /** Start a render. `source` set = the render window's selected target (or
   * a re-render); otherwise the main window falls back to its active view. */
  | {
      type: 'start'
      snapshot: RenderSettingsSnapshotWire
      source?: RenderSourceWire
      /** Movie re-encode: encode this many existing frames, no rendering. */
      encodeOnly?: { frameCount: number }
    }
  | { type: 'cancel' }
  /**
   * Store the editor's settings on a scene (one undoable edit; fire and
   * forget). The scene's change event, not a reply, tells the window what
   * the scene now holds.
   */
  | { type: 'write-settings'; sceneId: number; values: RenderSettingsValues }
  /** Undo / redo the target scene's last edit (Cmd+Z in the render window). */
  | { type: 'edit'; action: 'undo' | 'redo'; sceneId: number }
  /** Switch the main window to the latest result's source molview tab. */
  | { type: 'show-source' }
  /** Request a full state re-push (sent by the render window on mount). */
  | { type: 'sync' }
  /**
   * Drop every past render: the metadata list here, the archived images, and
   * the temp work directories the jobs left behind.
   */
  | { type: 'clear-history' }

/**
 * State pushed to the render window. Split into variants so the multi-MB
 * result image is sent once per completed render, never per progress tick.
 */
export type RenderWindowStateUpdate =
  | {
      kind: 'context'
      job: RenderJobWire | null
      /** Open molviews selectable as render targets. */
      views: RenderTargetViewWire[]
      /** The main window's active molview, or null when none is active. */
      activeViewId: number | null
      /**
       * Whether the umbreon render backend is compiled into this libcuemol2
       * build (probed in the main window via getAvailableSceneExporters). The
       * render window has no worker, so it learns this only from this push.
       */
      umbreonAvailable: boolean
    }
  /**
   * Completed renders, oldest first. The whole list travels because it is
   * metadata only -- each entry's image is archived on disk by the main
   * process and read back by result id (see shared/renderHistory) -- and
   * because it must survive a render-window close and re-sync.
   */
  | { kind: 'history'; entries: RenderResultWire[] }
  /**
   * A scene's stored render settings changed -- by this window's own write,
   * an undo / redo in the main window, or any other writer. The render
   * window decides whether its editor has to follow.
   */
  | {
      kind: 'sceneSettings'
      sceneId: number
      exists: boolean
      values: RenderSettingsValues
      defaults: RenderSettingsValues
    }
  /**
   * Most recently finished movie frame. Its own variant so the image never
   * rides along with the context pushes, which fire on every progress tick.
   */
  | { kind: 'framePreview'; preview: RenderFramePreviewWire | null }

/** Pixel size of the main window's molview canvas ("Current view" preset). */
export interface ViewSizePx {
  width: number
  height: number
}

/**
 * The questions the Rendering window can only answer by asking the main
 * window. It has no CueMol worker of its own, so anything that needs the
 * live scene -- the molview canvas size, a target view's camera, a hatch
 * style resolved by the C++ exporter -- takes a correlation-id round trip
 * out through the main process and back.
 *
 * One entry per question. The three relay channels are generic over this
 * map, so a fourth question is a row here plus a responder, not another
 * three channels and another copy of the correlation-id machinery.
 */
export interface RelayKinds {
  /** Pixel size of the main window's molview canvas. */
  viewSize: { req: void; res: ViewSizePx | null }
  /** What the given render-target view currently shows. */
  viewCamera: { req: { viewId: number }; res: RenderViewCamera | null }
  /** Spec text of a named hatch style, for the NPR layer editor. */
  hatchStyle: { req: { style: string }; res: HatchStyleSpecReply }
  /** A scene's stored render settings, for the editor to show. */
  sceneRenderSettings: { req: { sceneId: number }; res: SceneRenderSettingsReply }
}

export type RelayKind = keyof RelayKinds
export type RelayReq<K extends RelayKind> = RelayKinds[K]['req']
export type RelayRes<K extends RelayKind> = RelayKinds[K]['res']

/** RENDER_RELAY_GET payload: render window -> main. */
export type RelayGetPayload = {
  [K in RelayKind]: { kind: K; req: RelayReq<K> }
}[RelayKind]

/** RENDER_RELAY_REQUEST payload: main -> main window. */
export type RelayRequestPayload = {
  [K in RelayKind]: { kind: K; reqId: number; req: RelayReq<K> }
}[RelayKind]

/** RENDER_RELAY_REPLY payload: main window -> main. */
export type RelayReplyPayload = {
  [K in RelayKind]: { kind: K; reqId: number; res: RelayRes<K> }
}[RelayKind]
