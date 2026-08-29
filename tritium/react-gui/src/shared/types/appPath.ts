/**
 * @file shared/types/appPath.ts
 * @description Application paths and bundled-binary defaults resolved by main.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

export interface AppPathInfo {
  appPath: string
  exePath: string
  modulePath: string
  isPackaged: boolean
  sysConfigPath: string
  /** Absolute path to user_styles.xml in the OS app-data directory. */
  userStylePath: string
  /** Whether userStylePath exists on disk (evaluated in Main where fs is available). */
  userStyleExists: boolean
  /**
   * Default external render-binary paths resolved by Main (getRenderBinaries).
   * Packaged builds resolve from the install tree (process.resourcesPath); dev
   * builds resolve from the LIBCUEMOL2_ROOT / BUNDLE_APPS env vars the Taskfile
   * run task exports. A field is the empty string when its source is unset, so
   * the renderer falls back to the compiled-in DEFAULT_RENDER_BINARIES. Mirrors
   * the RenderBinaries shape (renderer/worker/shared/renderTypes).
   */
  defaultRenderBinaries: {
    povrayExe: string
    povrayInc: string
    blendpng: string
    ffmpeg: string
  }
  /**
   * Default APBS / pdb2pqr executable paths resolved by Main (getApbsBinaries).
   * Same resolution strategy as defaultRenderBinaries: packaged builds resolve
   * from the bundled `bundle_apps/apbs` tree under process.resourcesPath (staged
   * by tritium/packaging/collect-cuemol2-runtime.sh), dev builds from the
   * BUNDLE_APPS env var. A field is the empty string when its source is unset,
   * so the renderer falls back to the compiled-in DEFAULT_APBS_BINARIES. Mirrors
   * the ApbsBinaries shape (renderer/worker/shared/apbsTypes).
   */
  defaultApbsBinaries: {
    apbsExe: string
    pdb2pqrExe: string
  }
}
