/**
 * @file worker/server/services/renderjob/inProcessJob.ts
 * @description Jobs that render on a background C++ thread (umbreon).
 *
 * No task is queued with `ProcessManager` at all: the job holds a poll handle
 * (`InProcessRender`) and the shared timer drives it. A cancel here is
 * cooperative, so the loop keeps ticking until the handle reports done and
 * `finish()` can join the render thread.
 */
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { RenderStartArgs } from "@renderer/worker/shared/renderTypes";
import { type RenderBackend } from "./backends";
import { type InProcessRender } from "./backends/RenderBackend";
import { completeUnit } from "./completion";
import { cleanupDir } from "./fsUtil";
import { emit, jobs, stopAnim, stopTimer } from "./jobRegistry";
import { progressUpdate } from "./progress";
import type { RenderJobEntry } from "./types";
/**
 * Whatever the backend has reported since the last drain, as a log chunk.
 *
 * A backend that renders in-process has no stdout for the host to capture, so
 * its diagnostics (umbreon's fallback warnings, Embree errors, the per-stage GI
 * timing) only reach the render log through this. Backends without a
 * diagnostics channel omit `drainLog` and contribute nothing.
 */
function drainBackendLog(handle: InProcessRender): string {
  if (!handle.drainLog) return "";
  try {
    return handle.drainLog();
  } catch {
    // Diagnostics must never take the render down with them.
    return "";
  }
}

/**
 * One poll tick for an in-process render: push a progress update while it runs,
 * or -- once the background render reports done -- join the worker and write the
 * image via the handle's `finish()`, then complete the unit (or drop it on a
 * user cancel).
 *
 * A still job completes here; an animation job banks the frame and starts the
 * next one, so this drives both the still and the movie in-process paths.
 */
export function pollInProcessJob(
  ctx: WorkerContext,
  backend: RenderBackend,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  const handle = entry.inProcess;
  if (!handle) return;

  if (!handle.isDone()) {
    const frac = handle.progress(); // 0..1
    const phaseName = handle.phase();

    let logChunk = "";
    if (!entry.announcedDir) {
      logChunk += `Working dir: ${entry.workDir}\n`;
      entry.announcedDir = true;
    }
    // Log each phase transition once (umbreon Setup -> Primary -> ...),
    // closing the previous one with its elapsed time: the bare name says where
    // the render is, not which stage is costing anything.
    if (phaseName && phaseName !== entry.lastPhaseName) {
      const now = Date.now();
      if (entry.lastPhaseName && entry.lastPhaseAt > 0) {
        const sec = (now - entry.lastPhaseAt) / 1000;
        logChunk += `${entry.lastPhaseName} done (${sec.toFixed(1)}s)\n`;
      }
      entry.lastPhaseName = phaseName;
      entry.lastPhaseAt = now;
      logChunk += `${phaseName}...\n`;
    }
    logChunk += drainBackendLog(handle);

    const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
    emit(ctx, progressUpdate(entry, "running", logChunk, pct));
    return;
  }

  // Done (completed or cancelled): join the worker + write the PNG via finish().
  // The handle is cleared first: for a movie, completeUnit starts the next
  // frame, which installs a fresh handle.
  entry.inProcess = null;
  let cancelled: boolean;
  try {
    cancelled = handle.finish();
  } catch (e) {
    stopTimer(entry);
    jobs.delete(entry.jobId);
    stopAnim(entry);
    cleanupDir(entry.workDir);
    emit(ctx, { type: "error", jobId: entry.jobId, error: String(e) });
    return;
  }

  // Drain once more before the job moves on: the renderer reports its
  // per-stage timing at the very end of the render, which lands after the last
  // poll that still saw work in flight.
  const tailLog = drainBackendLog(handle);
  if (tailLog) emit(ctx, progressUpdate(entry, "running", tailLog, 100));

  if (cancelled || entry.cancelled) {
    // User cancellation: no complete push (matches the external cancel path).
    stopTimer(entry);
    jobs.delete(entry.jobId);
    stopAnim(entry);
    cleanupDir(entry.workDir);
    return;
  }

  // Still: emit `complete` (finishJob stops the timer). Movie: bank the frame
  // and start the next one, keeping the poll timer running.
  completeUnit(ctx, backend, entry, args);
}
