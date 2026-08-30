/**
 * @file worker/server/services/renderjob/completion.ts
 * @description Where a finished unit of work goes.
 *
 * A render unit ending means one of two things: a movie advances to its next
 * frame, and anything else is the whole job finishing.
 */
import * as fs from "fs";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { RenderStartArgs } from "@renderer/worker/shared/renderTypes";
import { type RenderBackend } from "./backends";
import { pixelImageSize } from "./backends/RenderBackend";
import { emit, jobs, stopTimer } from "./jobRegistry";
import { advanceAnimFrame } from "./movieJob";
import type { RenderJobEntry } from "./types";
/** Read the finished image and emit completion (or an error). */
export function finishJob(
  ctx: WorkerContext,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  stopTimer(entry);
  jobs.delete(entry.jobId);
  // The working dir (render.pov / .inc / .png) is kept for inspection.
  try {
    // Existence check only: the image itself is archived by the main process
    // and read back on demand, so it never becomes a multi-MB string here.
    fs.accessSync(entry.outputPath);
    // Report the actual pixel size (unit + DPI applied), not the raw value.
    const { width, height } = pixelImageSize(args.snapshot.commonProps);
    emit(ctx, {
      type: "complete",
      jobId: entry.jobId,
      imagePath: entry.outputPath,
      // Kept past the job (the .pov / .inc are worth inspecting), so hand it
      // over to be cleaned up with the render history rather than leaving one
      // directory per render in the temp dir forever.
      workDir: entry.workDir,
      width,
      height,
      elapsedSec: (Date.now() - entry.startedAt) / 1000,
    });
  } catch (e) {
    emit(ctx, {
      type: "error",
      jobId: entry.jobId,
      error: `Output image not produced: ${String(e)}`,
    });
  }
}

/**
 * One render unit finished. A still job completes here; an animation job
 * banks the frame and starts the next one.
 */
export function completeUnit(
  ctx: WorkerContext,
  backend: RenderBackend,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  if (entry.anim) advanceAnimFrame(ctx, backend, entry, args);
  else finishJob(ctx, entry, args);
}
