/**
 * @file worker/server/services/renderBackends/RenderBackend.ts
 * @description Backend-agnostic rendering interface.
 *
 * A `RenderBackend` knows how to write its own input files for a scene and
 * how to build the external-process tasks that produce the image. The
 * render-job service drives any backend through this interface, so adding
 * a backend needs no change to the job pipeline.
 */

import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { WorkerContext } from "../../types/WorkerContext";
import type { PropDef } from "../../../../data/rendererProperties";
import type { RenderSettingsSnapshot } from "../../../../data/renderResult";
import type { RenderBinaries } from "../../../shared/renderTypes";
import { sizeUnitToPx } from "../../../../data/renderSettings";

/** Paths produced by a backend's `exportScene`. */
export interface ExportedScene {
  /** Input file the render process consumes. */
  inputPath: string;
  /** Working directory for all intermediate files. */
  workDir: string;
  /**
   * Post-blend layer table parsed from the exporter (alpha-key -> comma-
   * separated object names). Empty when the scene needs no layering.
   */
  blendTable: Record<string, string>;
}

/** One external-process task for `ProcessManager.queueTask`. */
export interface RenderTaskSpec {
  /** Executable path. */
  exe: string;
  /** Single argument string. */
  args: string;
  /**
   * `render` tasks run first (in parallel) and drive the progress
   * percentage; `finalize` tasks (e.g. blendpng) are queued only after all
   * render tasks finish and are reported as the "blending" phase.
   */
  kind: "render" | "finalize";
}

/** A pluggable rendering backend. */
export interface RenderBackend {
  /** Stable backend id (matches `RenderBackendId`). */
  id: string;
  /** Write the backend input files for `scene`; returns their paths. */
  exportScene(
    ctx: WorkerContext,
    scene: Scene,
    snapshot: RenderSettingsSnapshot,
    workDir: string,
  ): ExportedScene;
  /**
   * Animation mode: write the input files for one frame.
   *
   * The backend hands its configured exporter to `AnimMgr.writeFrame()`,
   * which applies that frame's animation state and its own camera before
   * writing (so the exporter's `camera` name is not used here). Each frame
   * gets its own directory under `workDir`, which keeps `buildTasks` and
   * `outputImagePath` working unchanged.
   *
   * In-process backends implement `beginInProcessAnimFrame` instead. A backend
   * with neither cannot render animations and is rejected up-front.
   */
  exportAnimFrame?(
    ctx: WorkerContext,
    scene: Scene,
    animMgr: AnimMgr,
    snapshot: RenderSettingsSnapshot,
    workDir: string,
    frameIndex: number,
  ): ExportedScene;
  /** Build the process tasks that render `exported`. */
  buildTasks(
    exported: ExportedScene,
    snapshot: RenderSettingsSnapshot,
    binaries: RenderBinaries,
  ): RenderTaskSpec[];
  /** Extract a 0..100 progress percentage from a stdout chunk (null = none). */
  parseProgress(stdout: string): number | null;
  /** Final output image path, read once all tasks complete. */
  outputImagePath(exported: ExportedScene): string;
  /**
   * Optional: start an in-process (C++) render on a background thread and return
   * a handle to poll. When a backend defines this, the render-job pipeline calls
   * it INSTEAD of the external-process path -- `buildTasks` / `parseProgress` are
   * never invoked, and no ProcessManager task is queued. The ray trace runs on a
   * C++ worker thread, so the worker JS stays responsive: the pipeline polls the
   * handle between ticks, pushes progress, and calls `finish()` on completion.
   * See UmbreonBackend for the sole in-process backend.
   */
  beginInProcess?(
    ctx: WorkerContext,
    scene: Scene,
    snapshot: RenderSettingsSnapshot,
    outputPath: string,
  ): InProcessRender;
  /**
   * Animation mode for an in-process backend: start the current frame's render
   * on a background thread. When a backend defines this, the render-job
   * pipeline calls it INSTEAD of `exportAnimFrame` + `buildTasks`, so no
   * ProcessManager task is queued for the frame.
   *
   * The backend steps the animation itself -- `AnimMgr.beginFrame()` before
   * starting the render, `AnimMgr.endFrame()` from the handle's `finish()` --
   * which is what keeps the frame's state applied to the scene for the whole
   * (asynchronous) render. The pipeline then sees the same poll -> finish
   * cycle as a still in-process render and moves the finished frame into the
   * output folder. See UmbreonBackend.
   */
  beginInProcessAnimFrame?(
    ctx: WorkerContext,
    animMgr: AnimMgr,
    snapshot: RenderSettingsSnapshot,
    outputPath: string,
  ): InProcessRender;
}

/**
 * A running in-process (C++) render, polled by the render-job pipeline between
 * worker ticks. The heavy ray trace runs on a background C++ thread; these calls
 * only read lock-free progress state or request cancellation, so they return at
 * once and never block the worker.
 */
export interface InProcessRender {
  /** Overall completion in [0, 1]. */
  progress(): number;
  /** Human-readable current phase (backend-specific, e.g. umbreon RenderPhase). */
  phase(): string;
  /** True once the background render has finished (completed or cancelled). */
  isDone(): boolean;
  /**
   * Join the render and write the output image, unless it was cancelled. Returns
   * true if the render was cancelled (no image written). Releases backend
   * resources. Call once, after isDone() is true (or to force completion).
   */
  finish(): boolean;
  /** Request cooperative cancellation (the render stops at the next boundary). */
  cancel(): void;
  /**
   * Drain whatever the renderer has reported since the last call, for the render
   * log: fallback warnings, backend errors, per-stage timing. Newline-separated,
   * empty when there is nothing new. Optional -- a backend with no diagnostics
   * channel simply omits it.
   */
  drainLog?(): string;
}

// - PropDef value readers -

/** Read a numeric setting value by key. */
export function numVal(props: PropDef[], key: string, fallback: number): number {
  const v = props.find((p) => p.key === key)?.value;
  return typeof v === "number" ? v : fallback;
}

/** Read a string setting value by key. */
export function strVal(props: PropDef[], key: string, fallback: string): string {
  const v = props.find((p) => p.key === key)?.value;
  return typeof v === "string" ? v : fallback;
}

/** Read a boolean setting value by key. */
export function boolVal(props: PropDef[], key: string, fallback: boolean): boolean {
  const v = props.find((p) => p.key === key)?.value;
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Resolve the output image size in whole pixels from the common props.
 *
 * The width / height props hold the value in the selected size unit (px / in
 * / mm / cm); this applies the unit + DPI conversion so the backend always
 * works in pixels. Mirrors UXP `render-pov-dlg.js` which feeds
 * `round(convImgSizeUnit(value, dpi, unit))` to the renderer.
 */
export function pixelImageSize(common: PropDef[]): { width: number; height: number } {
  const unit = strVal(common, "unit", "px");
  const dpi = numVal(common, "dpi", 600);
  const toPx = (key: string, fallback: number): number =>
    Math.max(1, Math.round(sizeUnitToPx(numVal(common, key, fallback), dpi, unit)));
  return { width: toPx("width", 640), height: toPx("height", 480) };
}
