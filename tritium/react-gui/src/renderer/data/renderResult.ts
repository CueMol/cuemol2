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

/** Tab title for a render result: `Scene1 — 1216×612 (15.2s)`. */
export const renderResultTabTitle = (r: RenderResult): string =>
  `${r.sourceSceneName} — ${r.width}×${r.height} (${r.elapsedSec.toFixed(1)}s)`;

/** Largest canvas dimension used when synthesising the mock image. */
const MOCK_IMAGE_CAP = 1600;

/**
 * Synthesise a placeholder render image as a PNG data URL. Returns an empty
 * string when a 2D context is unavailable (e.g. jsdom under test).
 */
export function makeMockRenderImage(
  width: number,
  height: number,
  label: string,
): string {
  const scale = Math.min(1, MOCK_IMAGE_CAP / Math.max(width, height, 1));
  const cw = Math.max(1, Math.round(width * scale));
  const ch = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Diagonal gradient background.
  const grad = ctx.createLinearGradient(0, 0, cw, ch);
  grad.addColorStop(0, "#1b2a4a");
  grad.addColorStop(1, "#3a1b46");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  // Faint grid so zoom / fit / pan are visually obvious.
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  const step = Math.max(24, Math.round(Math.min(cw, ch) / 12));
  for (let x = step; x < cw; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ch);
    ctx.stroke();
  }
  for (let y = step; y < ch; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cw, y);
    ctx.stroke();
  }

  // Centred label and dimensions.
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const titleSize = Math.max(14, Math.round(ch / 14));
  ctx.font = `600 ${titleSize}px sans-serif`;
  ctx.fillText(label, cw / 2, ch / 2 - titleSize * 0.4);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `${Math.round(titleSize * 0.6)}px sans-serif`;
  ctx.fillText(`${width} × ${height}`, cw / 2, ch / 2 + titleSize * 0.7);

  return canvas.toDataURL("image/png");
}

/** Build a mock render result from the job's source and settings snapshot. */
export function buildMockRenderResult(args: {
  width: number;
  height: number;
  elapsedSec: number;
  source: RenderSource | undefined;
  snapshot: RenderSettingsSnapshot;
}): RenderResult {
  const sceneName = args.source?.sceneName || "Scene";
  return {
    id: `render-result-${Date.now()}`,
    imageDataUrl: makeMockRenderImage(args.width, args.height, sceneName),
    width: args.width,
    height: args.height,
    elapsedSec: args.elapsedSec,
    sourceSceneId: args.source?.sceneId ?? -1,
    sourceSceneName: sceneName,
    sourceViewId: args.source?.viewId,
    settingsSnapshot: args.snapshot,
  };
}
