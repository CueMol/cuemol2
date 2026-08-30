/**
 * @file worker/server/services/renderjob/jobLoop.ts
 * @description One timer tick: work out which phase the job is in and poll it.
 *
 * Every job kind runs on the same timer, so this is where they diverge --
 * in-process handle, movie encode, or the external task cycle.
 */
import type { ProcessManager } from "@cuemol/core/src/wrappers/ProcessManager";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { RenderStartArgs } from "@renderer/worker/shared/renderTypes";
import { type RenderBackend } from "./backends";
import { completeUnit } from "./completion";
import { pollInProcessJob } from "./inProcessJob";
import { emit } from "./jobRegistry";
import { pollEncode } from "./movieJob";
import { progressUpdate } from "./progress";
import { TASK_QUEUED, TASK_RUNNING } from "./types";
import type { RenderJobEntry } from "./types";
/** Poll the current phase's tasks; returns the accumulated stdout log. */
function pollTasks(
  ctx: WorkerContext,
  backend: RenderBackend,
  entry: RenderJobEntry,
): { allDone: boolean; logChunk: string } {
  const pm = ctx.svc.getService("ProcessManager") as ProcessManager;
  let allDone = true;
  let logChunk = "";
  for (let i = 0; i < entry.taskIds.length; i++) {
    const tid = entry.taskIds[i];
    if (tid < 0) continue;
    const status = pm.getTaskStatus(tid);
    // getResultOutput also moves an ended task out of its slot.
    const out = pm.getResultOutput(tid);
    if (out) {
      const p = backend.parseProgress(out);
      if (p !== null) entry.taskProgress[i] = Math.max(entry.taskProgress[i], p);
      else logChunk += out;
    }
    if (status === TASK_QUEUED || status === TASK_RUNNING) {
      allDone = false;
    } else {
      entry.taskProgress[i] = 100;
      entry.taskIds[i] = -1;
    }
  }
  return { allDone, logChunk };
}

/** One poll tick. */
export function pollJob(
  ctx: WorkerContext,
  backend: RenderBackend,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  // In-process render (umbreon): no ProcessManager task to poll. Checked
  // before the cancelled guard below -- a cancel here is cooperative, so the
  // loop must keep ticking until the handle reports done and `finish()` can
  // join the C++ render thread (renderCancel deliberately leaves the timer
  // running for exactly this).
  if (entry.inProcess) {
    pollInProcessJob(ctx, backend, entry, args);
    return;
  }

  if (entry.cancelled) return;

  // A movie encode runs as its own single-task phase, outside the per-frame
  // render -> finalize cycle below.
  if (entry.anim?.encodeTid != null) {
    pollEncode(ctx, entry, args);
    return;
  }

  const { allDone, logChunk: rawLog } = pollTasks(ctx, backend, entry);

  let logChunk = rawLog;
  if (!entry.announcedDir) {
    logChunk = `Working dir: ${entry.workDir}\n${logChunk}`;
    entry.announcedDir = true;
  }

  if (entry.phase === "render") {
    if (!allDone) {
      emit(ctx, progressUpdate(entry, "running", logChunk));
      return;
    }
    // All render tasks finished -- queue the finalize task(s) now. The
    // queueTask call is what advances the ProcessManager queue.
    emit(ctx, progressUpdate(entry, "blending", logChunk, 100));
    if (entry.finalizeSpecs.length === 0) {
      completeUnit(ctx, backend, entry, args);
      return;
    }
    const pm = ctx.svc.getService("ProcessManager") as ProcessManager;
    const finIds: number[] = [];
    for (const t of entry.finalizeSpecs) {
      const tid = pm.queueTask(t.exe, t.args, "");
      if (tid >= 0) finIds.push(tid);
    }
    entry.phase = "finalize";
    entry.taskIds = finIds;
    entry.taskProgress = finIds.map(() => 0);
    return;
  }

  // Finalize phase.
  emit(ctx, progressUpdate(entry, "blending", logChunk, 100));
  if (allDone) completeUnit(ctx, backend, entry, args);
}
