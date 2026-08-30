/**
 * @file worker/server/services/renderjob/renderJob.service.ts
 * @description Worker-side render pipeline: starting and cancelling a job.
 *
 * `renderStart` exports the scene through the selected backend and hands the
 * job to whichever machine can run it (see startJob.ts); `renderCancel` stops
 * one. Everything under `renderjob/` exists because those two entry points
 * cover four combinations -- (still | movie) x (external process | in-process
 * thread) -- that share a registry, a poll timer and a progress model.
 *
 * ## Queue ordering
 *
 * `ProcessManager` only advances its queue when `queueTask` is called (its
 * idle-task pump is not driven inside the worker). So instead of queuing the
 * blendpng finalize task up-front with a dependency, the pipeline runs in
 * two phases: all render tasks are queued first, and the finalize task is
 * queued by the poll loop once every render task has finished -- that
 * `queueTask` call is what starts it.
 *
 * All file I/O uses Node `fs` (the worker runs with
 * `nodeIntegrationInWorker: true`).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ProcessManager } from "@cuemol/core/src/wrappers/ProcessManager";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type {
  RenderStartArgs,
  RenderStartResult,
  RenderCancelArgs,
  RenderCancelResult,
} from "@renderer/worker/shared/renderTypes";
import { getRenderBackend } from "./backends";
import { type RenderTaskSpec } from "./backends/RenderBackend";
import { getSceneOrNull } from "@renderer/worker/server/services/helpers/sceneResolver";
import { cleanupDir } from "./fsUtil";
import { pollJob } from "./jobLoop";
import { emit, jobs, stopAnim, stopTimer } from "./jobRegistry";
import { startAnimJob, startEncodeOnlyJob, startInProcessJob } from "./startJob";
import { POLL_MS } from "./types";
import type { RenderJobEntry } from "./types";
/** Start a render job. */
export function renderStart(ctx: WorkerContext, args: RenderStartArgs): RenderStartResult {
  // Re-encode needs no scene: it runs ffmpeg over frames already on disk.
  if (args.snapshot.mode === "movie" && args.encodeOnly) {
    return startEncodeOnlyJob(ctx, args);
  }

  const scene = getSceneOrNull(ctx, args.sceneId);
  if (!scene) return { ok: false, jobId: "", error: "Scene not found" };

  const backend = getRenderBackend(args.snapshot.backend);
  if (!backend) {
    return { ok: false, jobId: "", error: `Unknown backend: ${args.snapshot.backend}` };
  }

  // Capture the active view into the "__current" camera the exporter uses.
  if (args.viewId !== undefined) {
    const s = scene as unknown as {
      saveViewToCam?: (viewId: number, camName: string) => boolean;
    };
    try {
      s.saveViewToCam?.(args.viewId, "__current");
    } catch {
      /* fall back to the scene's default camera */
    }
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cuemol-render-"));

  // Animation mode drives AnimMgr frame by frame instead of exporting once.
  if (args.snapshot.mode === "movie") {
    return startAnimJob(ctx, backend, scene, args, workDir);
  }

  let outputPath: string;
  let renderSpecs: RenderTaskSpec[];
  let finalizeSpecs: RenderTaskSpec[];
  let taskIds: number[];
  try {
    const exported = backend.exportScene(ctx, scene, args.snapshot, workDir);
    outputPath = backend.outputImagePath(exported);

    // In-process backend (umbreon): start the background render and poll it,
    // skipping the external-process (buildTasks / ProcessManager) path entirely.
    if (backend.beginInProcess) {
      return startInProcessJob(ctx, backend, scene, args, workDir, outputPath);
    }

    const tasks = backend.buildTasks(exported, args.snapshot, args.binaries);
    renderSpecs = tasks.filter((t) => t.kind === "render");
    finalizeSpecs = tasks.filter((t) => t.kind === "finalize");
    if (renderSpecs.length === 0) throw new Error("backend produced no render tasks");

    // Fail early with a clear message if a binary is missing.
    for (const exe of new Set(tasks.map((t) => t.exe))) {
      if (!fs.existsSync(exe)) throw new Error(`Executable not found: ${exe}`);
    }

    const pm = ctx.svc.getService("ProcessManager") as ProcessManager;
    // Give every render layer a slot so none waits in the (un-pumped) queue.
    if (renderSpecs.length > pm.getSlotSize()) {
      pm.setSlotSize(renderSpecs.length);
    }
    taskIds = [];
    for (const t of renderSpecs) {
      const tid = pm.queueTask(t.exe, t.args, "");
      if (tid < 0) throw new Error("ProcessManager could not queue a render task");
      taskIds.push(tid);
    }
  } catch (e) {
    cleanupDir(workDir);
    return { ok: false, jobId: "", error: String(e) };
  }

  const jobId = `render-${Date.now()}`;
  const entry: RenderJobEntry = {
    jobId,
    workDir,
    outputPath,
    startedAt: Date.now(),
    timer: null,
    cancelled: false,
    announcedDir: false,
    phase: "render",
    finalizeSpecs,
    taskIds,
    taskProgress: taskIds.map(() => 0),
    inProcess: null,
    lastPhaseName: "",
    lastPhaseAt: 0,
    anim: null,
  };
  jobs.set(jobId, entry);
  entry.timer = setInterval(() => {
    try {
      pollJob(ctx, backend, entry, args);
    } catch (e) {
      stopTimer(entry);
      jobs.delete(jobId);
      emit(ctx, { type: "error", jobId, error: String(e) });
    }
  }, POLL_MS);

  return { ok: true, jobId };
}

/** Cancel a running render job. */
export function renderCancel(ctx: WorkerContext, args: RenderCancelArgs): RenderCancelResult {
  const entry = jobs.get(args.jobId);
  if (!entry) return { ok: false };
  entry.cancelled = true;

  // In-process (umbreon): request cooperative cancellation and let the poll loop
  // observe isDone() and finish() (which joins the C++ worker cleanly, and for a
  // movie also releases the frame back to AnimMgr before stopAnim runs). Killing
  // the timer here would leave the render thread running detached.
  if (entry.inProcess) {
    try {
      entry.inProcess.cancel();
    } catch {
      /* ignore */
    }
    return { ok: true };
  }

  // External-process (POV-Ray): stop polling and kill the render processes now.
  stopTimer(entry);
  jobs.delete(entry.jobId);
  // Restores the scene properties an animation overwrote (no-op for a still).
  stopAnim(entry);

  const pm = ctx.svc.getService("ProcessManager") as ProcessManager;
  // The current phase's render tasks, plus the ffmpeg encode task if one is
  // in flight.
  const tids = [...entry.taskIds];
  if (entry.anim?.encodeTid != null) tids.push(entry.anim.encodeTid);
  for (const tid of tids) {
    if (tid >= 0) {
      try {
        pm.kill(tid);
      } catch {
        /* ignore */
      }
    }
  }
  cleanupDir(entry.workDir);
  return { ok: true };
}

/**
 * Cancel every render job still in flight.
 *
 * Called from the window-close chain. An external-process render (POV-Ray, and
 * the ffmpeg encode of a movie) is spawned through the C++ ProcessManager with
 * posix_spawn, so it is an ordinary child: killing the app leaves it running,
 * writing into a work directory nothing will reclaim. renderCancel already
 * kills the tasks and cleans the directory up -- nothing was calling it on the
 * way out.
 *
 * An in-process render (umbreon) is cancelled cooperatively and keeps its
 * registry entry, because normally the poll loop is what observes the
 * cancellation and finishes the job. That loop will not run again here, but
 * there is no external process to strand either -- the render thread goes with
 * the worker.
 *
 * @returns how many jobs were asked to stop.
 */
export function cancelAllRenderJobs(ctx: WorkerContext): number {
  const ids = [...jobs.keys()];
  for (const jobId of ids) {
    try {
      renderCancel(ctx, { jobId });
    } catch (e) {
      console.warn(`renderCancel(${jobId}) failed during shutdown:`, e);
    }
  }
  return ids.length;
}

export const services = { renderStart, renderCancel };

// Read by WorkerService (playback pause) and the shutdown service; both want
// the job registry, not a service call.
export { isSceneBeingRendered } from "./jobRegistry";
