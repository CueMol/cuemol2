/**
 * @file worker/server/services/renderJob.service.ts
 * @description Worker-side render pipeline.
 *
 * `renderStart` exports the scene via the selected backend, queues the
 * render process(es) on the C++ `ProcessManager`, and starts a polling
 * timer that pushes `render-progress` updates to the renderer. `renderCancel`
 * stops a running job. All file I/O uses Node `fs` (the worker runs with
 * `nodeIntegrationInWorker: true`).
 *
 * ## Queue ordering
 *
 * `ProcessManager` only advances its queue when `queueTask` is called (its
 * idle-task pump is not driven inside the worker). So instead of queuing the
 * blendpng finalize task up-front with a dependency, the pipeline runs in
 * two phases: all render tasks are queued first, and the finalize task is
 * queued by the poll loop once every render task has finished — that
 * `queueTask` call is what starts it.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { ProcessManager } from "@cuemol/core/src/wrappers/ProcessManager";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { WorkerContext } from "../types/WorkerContext";
import type {
  RenderStartArgs,
  RenderStartResult,
  RenderCancelArgs,
  RenderCancelResult,
  RenderUpdate,
} from "../../shared/renderTypes";
import { RENDER_PROGRESS_CHANNEL } from "../../shared/renderTypes";
import { getRenderBackend, type RenderBackend } from "./renderBackends";
import { numVal, type RenderTaskSpec } from "./renderBackends/RenderBackend";

/** Poll interval for process status / stdout. */
const POLL_MS = 700;

/** ProcessManager task states. */
const TASK_QUEUED = 0;
const TASK_RUNNING = 1;

/** Phase of a render job. */
type JobPhase = "render" | "finalize";

/** State of one in-flight render job. */
interface RenderJobEntry {
  jobId: string;
  workDir: string;
  outputPath: string;
  startedAt: number;
  timer: ReturnType<typeof setInterval> | null;
  cancelled: boolean;
  /** Whether the working-dir path has been reported to the render log. */
  announcedDir: boolean;
  /** Current phase. */
  phase: JobPhase;
  /** Finalize task specs, queued once render tasks finish. */
  finalizeSpecs: RenderTaskSpec[];
  /** Task ids of the current phase; an id is set to -1 once its task ends. */
  taskIds: number[];
  /** Per-task progress 0..100, parallel to `taskIds`. */
  taskProgress: number[];
}

const jobs = new Map<string, RenderJobEntry>();

/** Push a render update to the renderer. */
function emit(ctx: WorkerContext, update: RenderUpdate): void {
  ctx.svc.pushMessage(RENDER_PROGRESS_CHANNEL, update);
}

/** Remove a working directory, ignoring errors. */
function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function stopTimer(entry: RenderJobEntry): void {
  if (entry.timer !== null) {
    clearInterval(entry.timer);
    entry.timer = null;
  }
}

/** Read the finished image and emit completion (or an error). */
function finishJob(
  ctx: WorkerContext,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  stopTimer(entry);
  jobs.delete(entry.jobId);
  // Phase 5 keeps the working dir (render.pov / .inc / .png) for inspection.
  try {
    const buf = fs.readFileSync(entry.outputPath);
    emit(ctx, {
      type: "complete",
      jobId: entry.jobId,
      imageDataUrl: `data:image/png;base64,${buf.toString("base64")}`,
      width: numVal(args.snapshot.commonProps, "width", 0),
      height: numVal(args.snapshot.commonProps, "height", 0),
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

/** Mean of an array (0 when empty). */
function mean(xs: number[]): number {
  return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0;
}

/** One poll tick. */
function pollJob(
  ctx: WorkerContext,
  backend: RenderBackend,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  if (entry.cancelled) return;
  const { allDone, logChunk: rawLog } = pollTasks(ctx, backend, entry);

  let logChunk = rawLog;
  if (!entry.announcedDir) {
    logChunk = `Working dir: ${entry.workDir}\n${logChunk}`;
    entry.announcedDir = true;
  }

  if (entry.phase === "render") {
    if (!allDone) {
      emit(ctx, {
        type: "progress",
        jobId: entry.jobId,
        progress: mean(entry.taskProgress),
        phase: "running",
        logChunk: logChunk || undefined,
      });
      return;
    }
    // All render tasks finished — queue the finalize task(s) now. The
    // queueTask call is what advances the ProcessManager queue.
    emit(ctx, {
      type: "progress",
      jobId: entry.jobId,
      progress: 100,
      phase: "blending",
      logChunk: logChunk || undefined,
    });
    if (entry.finalizeSpecs.length === 0) {
      finishJob(ctx, entry, args);
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
  emit(ctx, {
    type: "progress",
    jobId: entry.jobId,
    progress: 100,
    phase: "blending",
    logChunk: logChunk || undefined,
  });
  if (allDone) finishJob(ctx, entry, args);
}

/** Start a render job. */
function renderStart(ctx: WorkerContext, args: RenderStartArgs): RenderStartResult {
  const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
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

  let outputPath: string;
  let renderSpecs: RenderTaskSpec[];
  let finalizeSpecs: RenderTaskSpec[];
  let taskIds: number[];
  try {
    const exported = backend.exportScene(ctx, scene, args.snapshot, workDir);
    outputPath = backend.outputImagePath(exported);
    const tasks = backend.buildTasks(exported, args.snapshot);
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
function renderCancel(ctx: WorkerContext, args: RenderCancelArgs): RenderCancelResult {
  const entry = jobs.get(args.jobId);
  if (!entry) return { ok: false };
  entry.cancelled = true;
  stopTimer(entry);
  jobs.delete(entry.jobId);

  const pm = ctx.svc.getService("ProcessManager") as ProcessManager;
  for (const tid of entry.taskIds) {
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

export const services = { renderStart, renderCancel };
