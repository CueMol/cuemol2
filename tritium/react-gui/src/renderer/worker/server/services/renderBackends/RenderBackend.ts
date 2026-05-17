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

/** Paths produced by a backend's `exportScene`. */
export interface ExportedScene {
  /** Input file the render process consumes. */
  inputPath: string;
  /** Working directory for all intermediate files. */
  workDir: string;
}

/** One external-process task for `ProcessManager.queueTask`. */
export interface RenderTaskSpec {
  /** Executable path. */
  exe: string;
  /** Single argument string. */
  args: string;
  /** Space-separated dependency task ids ("" = run immediately). */
  waitFor: string;
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
  ): RenderTaskSpec[];
  /** Extract a 0..100 progress percentage from a stdout chunk (null = none). */
  parseProgress(stdout: string): number | null;
  /** Final output image path, read once all tasks complete. */
  outputImagePath(exported: ExportedScene): string;
}

// ── PropDef value readers ────────────────────────────────────

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
