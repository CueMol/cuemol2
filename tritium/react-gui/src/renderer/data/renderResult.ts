/**
 * @file data/renderResult.ts
 * @description Types and helpers for a completed render result.
 *
 * A render result is shown in the modeless Rendering window's image area
 * (see RenderWindowApp). It carries the rendered image, the source-scene
 * reference and a frozen snapshot of the settings used, so the result can
 * be inspected and re-rendered.
 */

import type { PropDef } from "./rendererProperties";
import type { RenderBackendId, RenderMode, MovieSettings } from "./renderSettings";

/** Reference to the scene/view a render was started from. */
export interface RenderSource {
  sceneId: number;
  sceneName: string;
  /** Active molview tab's view id, used to navigate back to the source. */
  viewId?: number;
}

/** Frozen copy of the render settings used for a result. */
export interface RenderSettingsSnapshot {
  /** Whether this render produces one image or the animation's frames. */
  mode: RenderMode;
  backend: RenderBackendId;
  commonProps: PropDef[];
  backendProps: PropDef[];
  /** Movie settings; only present when mode is "movie". */
  movie?: MovieSettings;
}

/**
 * Where a finished movie's frames live. The images stay on disk and are read
 * back one at a time by the result viewer's frame slider; keeping a whole
 * sequence in memory is not viable.
 */
export interface RenderMovieOutput {
  frameCount: number;
  outputDir: string;
  baseName: string;
  /** Encoded movie file, when one was produced (makeMovie). */
  moviePath?: string;
}

/** A completed render, displayed in the Rendering window. */
export interface RenderResult {
  /** Unique id. */
  id: string;
  /** Rendered image as a data URL; for a movie, its last frame. */
  imageDataUrl: string;
  /** Logical image width in pixels. */
  width: number;
  /** Logical image height in pixels. */
  height: number;
  /** Wall-clock render time in seconds. */
  elapsedSec: number;
  /** Source scene uid. */
  sourceSceneId: number;
  /** Source scene display name. */
  sourceSceneName: string;
  /** Source molview tab's view id (for "Show Source Scene"). */
  sourceViewId?: number;
  /** Settings used for this render. */
  settingsSnapshot: RenderSettingsSnapshot;
  /** Present when this was a movie render. */
  movie?: RenderMovieOutput;
}

/** Build a render result from the rendered image and the job's context. */
export function buildRenderResult(args: {
  imageDataUrl: string;
  width: number;
  height: number;
  elapsedSec: number;
  source: RenderSource;
  snapshot: RenderSettingsSnapshot;
  movie?: RenderMovieOutput;
}): RenderResult {
  return {
    id: `render-result-${Date.now()}`,
    imageDataUrl: args.imageDataUrl,
    width: args.width,
    height: args.height,
    elapsedSec: args.elapsedSec,
    sourceSceneId: args.source.sceneId,
    sourceSceneName: args.source.sceneName || "Scene",
    sourceViewId: args.source.viewId,
    settingsSnapshot: args.snapshot,
    ...(args.movie ? { movie: args.movie } : {}),
  };
}
