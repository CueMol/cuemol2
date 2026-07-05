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
import type { RenderBackendId } from "./renderSettings";

/** Reference to the scene/view a render was started from. */
export interface RenderSource {
  sceneId: number;
  sceneName: string;
  /** Active molview tab's view id, used to navigate back to the source. */
  viewId?: number;
}

/** Frozen copy of the render settings used for a result. */
export interface RenderSettingsSnapshot {
  backend: RenderBackendId;
  commonProps: PropDef[];
  backendProps: PropDef[];
}

/** A completed render, displayed in the Rendering window. */
export interface RenderResult {
  /** Unique id. */
  id: string;
  /** Rendered image as a data URL. */
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
}

/** Build a render result from the rendered image and the job's context. */
export function buildRenderResult(args: {
  imageDataUrl: string;
  width: number;
  height: number;
  elapsedSec: number;
  source: RenderSource;
  snapshot: RenderSettingsSnapshot;
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
  };
}
