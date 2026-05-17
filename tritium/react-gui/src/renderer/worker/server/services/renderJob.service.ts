/**
 * @file worker/server/services/renderJob.service.ts
 * @description Worker-side render pipeline.
 *
 * `renderStart` exports the scene via the selected backend, queues the
 * render process(es) on the C++ `ProcessManager`, and starts a polling
 * timer that pushes `render-progress` updates to the renderer. `renderCancel`
 * stops a running job. All file I/O uses Node `fs` (the worker runs with
 * `nodeIntegrationInWorker: true`).
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
import { numVal } from "./renderBackends/RenderBackend";

/** Poll interval for process status / stdout. */
const POLL_MS = 700;

/** ProcessManager task states. */
const TASK_QUEUED = 0;
const TASK_RUNNING = 1;

/** State of one in-flight render job. */
interface RenderJobEntry {
  jobId: string;
  workDir: string;
  /** Queued task ids; an id is set to -1 once its task has ended. */
  taskIds: number[];
  outputPath: string;
  startedAt: number;
  timer: ReturnType<typeof setInterval> | null;
  lastProgress: number;
  cancelled: boolean;
  /** Whether the working-dir path has been reported to the render log. */
  announcedDir: boolean;
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

/** Read the finished image, emit completion, and clean up. */
function finishJob(
  ctx: WorkerContext,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  stopTimer(entry);
  jobs.delete(entry.jobId);
  // Phase 4 keeps the working dir (render.pov / .inc / .png) for inspection;
  // phase 5 re-enables success cleanup.
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

/** One poll tick: check process status, push progress, finish when done. */
function pollJob(
  ctx: WorkerContext,
  backend: RenderBackend,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  if (entry.cancelled) return;
  const pm = ctx.svc.getService("ProcessManager") as ProcessManager;

  let allDone = true;
  let progress = entry.lastProgress;
  let logChunk = "";
  for (let i = 0; i < entry.taskIds.length; i++) {
    const tid = entry.taskIds[i];
    if (tid < 0) continue;
    const status = pm.getTaskStatus(tid);
    const out = pm.getResultOutput(tid);
    if (out) {
      const p = backend.parseProgress(out);
      if (p !== null) progress = Math.max(progress, p);
      else logChunk += out;
    }
    if (status === TASK_QUEUED || status === TASK_RUNNING) {
      allDone = false;
    } else {
      entry.taskIds[i] = -1;
    }
  }
  entry.lastProgress = progress;

  // Report the working-dir path once so the .pov/.inc can be inspected.
  if (!entry.announcedDir) {
    logChunk = `Working dir: ${entry.workDir}\n${logChunk}`;
    entry.announcedDir = true;
  }

  if (!allDone) {
    emit(ctx, {
      type: "progress",
      jobId: entry.jobId,
      progress,
      phase: "running",
      logChunk: logChunk || undefined,
    });
    return;
  }
  finishJob(ctx, entry, args);
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
  emit(ctx, {
    type: "progress",
    jobId: "pending",
    progress: 0,
    phase: "exporting",
  });

  let outputPath: string;
  let taskIds: number[];
  try {
    const exported = backend.exportScene(ctx, scene, args.snapshot, workDir);
    outputPath = backend.outputImagePath(exported);
    const tasks = backend.buildTasks(exported, args.snapshot);
    const pm = ctx.svc.getService("ProcessManager") as ProcessManager;
    taskIds = [];
    for (const t of tasks) {
      const tid = pm.queueTask(t.exe, t.args, t.waitFor);
      if (tid < 0) throw new Error("ProcessManager could not queue the render task");
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
    taskIds,
    outputPath,
    startedAt: Date.now(),
    timer: null,
    lastProgress: 0,
    cancelled: false,
    announcedDir: false,
  };
  jobs.set(jobId, entry);
  entry.timer = setInterval(() => {
    try {
      pollJob(ctx, backend, entry, args);
    } catch (e) {
      stopTimer(entry);
      jobs.delete(jobId);
      emit(ctx, { type: "error", jobId, error: String(e) });
      cleanupDir(entry.workDir);
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
