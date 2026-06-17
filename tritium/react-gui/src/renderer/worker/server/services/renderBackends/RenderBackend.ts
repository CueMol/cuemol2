/**
 * @file worker/server/services/renderBackends/RenderBackend.ts
 * @description Backend-agnostic rendering interface.
 *
 * A `RenderBackend` knows how to write its own input files for a scene and
 * how to build the external-process tasks that produce the image. The
 * render-job service drives any backend through this interface, so adding
 * a backend needs no change to the job pipeline.
 */

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
