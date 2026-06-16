/**
 * @file data/renderResult.ts
 * @description Types and mock helpers for a completed render result.
 *
 * A render result is opened as its own ContentArea tab. It carries the
 * rendered image, the source-scene reference and a frozen snapshot of the
 * settings used, so the result tab can be inspected and re-rendered.
 *
 * Phase 3 is mock-only: `makeMockRenderImage` synthesises a placeholder
 * image so the result tab and viewer can be exercised before the real
 * worker-side pipeline (phase 4) exists.
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

/** A completed render, displayed in its own ContentArea tab. */
export interface RenderResult {
  /** Unique id (also used as the tab id). */
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

/** Tab title for a render result: `Scene1 -- 1216×612 (15.2s)`. */
export const renderResultTabTitle = (r: RenderResult): string =>
  `${r.sourceSceneName} — ${r.width}×${r.height} (${r.elapsedSec.toFixed(1)}s)`;

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
