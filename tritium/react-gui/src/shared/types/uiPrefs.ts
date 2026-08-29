/**
 * @file shared/types/uiPrefs.ts
 * @description Miscellaneous UI preferences exchanged with the main process.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 *
 * Persisted on disk by main/stateStore.ts (electron-store). Changes must be
 * additive: a removed or renamed field silently drops what users saved.
 */

/**
 * Movie-mode output preferences of the Rendering window.
 *
 * Declared structurally (all fields optional, no renderer types) so shared and
 * main can read it without importing renderer/data/renderSettings; the renderer
 * merges it over DEFAULT_MOVIE_SETTINGS. Persisted because the Rendering window
 * is destroyed on close, which used to lose every movie setting on every close
 * (UXP `anim-render-dlg` kept the same values in prefs).
 */
export interface MovieRenderPrefs {
  /** Whether the output folder is the app-managed temporary one. */
  useTempDir?: boolean
  /** Last user-picked output folder; only meaningful with useTempDir false. */
  outputDir?: string
  baseName?: string
  fps?: number
  makeMovie?: boolean
  /** MovieFormatId; kept as a plain string here to avoid a renderer import. */
  movieFormat?: string
  dupLastFrame?: boolean
  bitrateKbps?: number
}

/** Miscellaneous UI preferences exchanged with the main process. */
export interface UiState {
  sidebarActiveView?: string
  selectionMolId?: string
  theme?: 'dark' | 'light'
  /**
   * Pointing-device preference for 3D navigation. Selects which ViewInputConfig
   * style is applied (mouse: wheel zooms; trackpad: two-finger scroll pans,
   * pinch zooms). 'auto' detects the device from the wheel-event stream.
   * Defaults to 'auto'.
   */
  inputDeviceMode?: 'mouse' | 'trackpad' | 'auto'
  /**
   * Last device the 'auto' preference resolved to. Persisted so an auto session
   * starts with the previously-detected preset instead of always seeding mouse.
   */
  inputDeviceDetected?: 'mouse' | 'trackpad'
  /** POV-Ray executable path (Rendering settings). */
  povrayExe?: string
  /** POV-Ray include directory path (Rendering settings). */
  povrayInc?: string
  /** blendpng executable path (Rendering settings). */
  blendpng?: string
  /** ffmpeg executable path (Rendering settings). */
  ffmpeg?: string
  /** APBS executable path (External Tools settings). */
  apbsExe?: string
  /** pdb2pqr executable path (External Tools settings). */
  pdb2pqrExe?: string
  /** Default pdb2pqr force field (External Tools settings). */
  pdb2pqrFF?: string
  /** Movie-mode output preferences (Rendering window). */
  movieRender?: MovieRenderPrefs
  /**
   * Writer last used by object "Save File As" (UXP pref
   * `cuemol2.ui.histories.save_writer_name`). Electron's save dialog cannot
   * preselect a filter row, so this writer is moved to the head of the filter
   * list instead -- see `getObjectSaveInfo`'s `preferredWriter`.
   */
  saveWriterName?: string
}
