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
 * queued by the poll loop once every render task has finished -- that
 * `queueTask` call is what starts it.
 *
 * ## In-process backends
 *
 * A backend can instead render inside this process on a background C++ thread
 * (umbreon). Then no task is queued at all: the pipeline holds a poll handle
 * (`InProcessRender`) and drives it on the same timer. Both render modes go
 * through this path -- a still uses `beginInProcess`, a movie repeats
 * `beginInProcessAnimFrame` once per frame -- so the phase fields below are
 * shared by all four combinations of (still | movie) x (external | in-process).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { ProcessManager } from "@cuemol/core/src/wrappers/ProcessManager";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { TimeValue } from "@cuemol/core/src/wrappers/TimeValue";
import type { WorkerContext } from "../types/WorkerContext";
import type {
  RenderStartArgs,
  RenderStartResult,
  RenderCancelArgs,
  RenderCancelResult,
  RenderUpdate,
  RenderUpdatePhase,
} from "../../shared/renderTypes";
import { RENDER_PROGRESS_CHANNEL } from "../../shared/renderTypes";
import { getRenderBackend, type RenderBackend } from "./renderBackends";
import {
  pixelImageSize,
  type RenderTaskSpec,
  type InProcessRender,
} from "./renderBackends/RenderBackend";
import { getSceneOrNull } from "./helpers/sceneResolver";
import { getAnimMgrOrNull } from "./helpers/animResolve";
import {
  frameFileRegExp,
  movieFileNames,
  movieFrameFileName,
  resolveMovieBaseName,
} from "@shared/movieFrames";
import {
  buildFfmpegArgs,
  movieOutputPath,
  type FfmpegEncodeOptions,
} from "./ffmpegEncode";

/** Poll interval for external process status / stdout. */
const POLL_MS = 700;

/**
 * Poll interval for an in-process (umbreon) render. Shorter than POLL_MS: the
 * local ray tracer's progress advances continuously, so a tighter poll drives a
 * smoother bar. Each tick is a handful of lock-free C++ reads, so it is cheap.
 */
const IN_PROCESS_POLL_MS = 250;

/** ProcessManager task states. */
const TASK_QUEUED = 0;
const TASK_RUNNING = 1;

/** Phase of a render job. */
type JobPhase = "render" | "finalize";

/**
 * State of an in-flight animation render. The job renders one frame at a
 * time: each frame runs the same cycle as a still (render -> finalize for an
 * external backend, one poll handle for an in-process one), and the poll loop
 * starts the next frame instead of completing the job.
 */
interface AnimJobState {
  /** The scene's animation manager (null for a re-encode-only job). */
  animMgr: AnimMgr | null;
  /** Scene being rendered (null for a re-encode-only job). */
  scene: Scene | null;
  /** Total number of frames this job renders. */
  frameCount: number;
  /** 0-based index of the frame currently rendering. */
  currFrame: number;
  /** Folder finished frames are moved into. */
  outputDir: string;
  /** Base name of the output files. */
  baseName: string;
  /** Output paths of the frames finished so far. */
  framePaths: string[];
  /** When the last live-preview image was pushed (rate limiting). */
  lastPreviewAt: number;
  /** Movie encode in progress: the ffmpeg task id, else null. */
  encodeTid: number | null;
  /** Encoded movie path, once the encode has been queued. */
  moviePath: string | null;
  /** Tail of ffmpeg's output, so a failed encode can say why. */
  encodeLog: string;
  /**
   * Start-camera name the render replaced, to be put back when it ends; null
   * when the animation's own start camera was used as-is.
   */
  startCamBak: string | null;
}

/**
 * Shortest gap between live-preview pushes. A preview carries a full image,
 * so it is kept well below the progress-tick rate; POV-Ray frames take
 * seconds anyway, but a cheap backend could otherwise stream one per frame.
 */
const PREVIEW_MIN_INTERVAL_MS = 1000;

/** Expand a leading `~` to the user's home directory. */
function expandHomePath(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

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
  /** In-process render handle (umbreon); null for external-process jobs. */
  inProcess: InProcessRender | null;
  /** Last in-process phase name pushed to the log (so it is logged on change). */
  lastPhaseName: string;
  /**
   * When `lastPhaseName` began, so each phase can be logged with how long it
   * took. Poll-resolution only (IN_PROCESS_POLL_MS) -- the exact per-stage
   * split arrives from the backend itself at the end of the render.
   */
  lastPhaseAt: number;
  /** Animation state; null for a still render. */
  anim: AnimJobState | null;
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

// --- Animation (movie) rendering ---

/** Create a C++ TimeValue holding `ms` milliseconds. */
function makeTimeValue(ctx: WorkerContext, ms: number): TimeValue {
  const tv = ctx.svc.createObj("TimeValue") as TimeValue | null;
  if (!tv) throw new Error("cannot create TimeValue");
  tv.millisec = Math.max(0, Math.round(ms));
  return tv;
}

/**
 * Stop the animation manager. This is what restores the scene properties the
 * animation overwrote, so it must run on every exit -- completion, error and
 * cancel alike. Safe to call more than once.
 */
function stopAnim(entry: RenderJobEntry): void {
  const anim = entry.anim;
  if (!anim?.animMgr) return;
  try {
    anim.animMgr.stop();
  } catch {
    /* ignore */
  }
  // Put back the start camera the render had to replace. `startcam` is a scene
  // property the Animation panel shows and the scene file stores, so leaving
  // the render's stand-in behind would quietly rewrite the user's choice --
  // AnimMgr::stop() restores animated properties, not this one.
  if (anim.startCamBak !== null) {
    restoreStartCam(anim.animMgr, anim.startCamBak);
    anim.startCamBak = null;
  }
}

/**
 * Name of the implicit "camera the user is looking through" (UXP convention;
 * see ensureStartCam in animation.service.ts, which seeds `startcam` from it).
 */
const CURRENT_CAM_NAME = "__current";

/** Whether the scene has a camera by this name; null when it cannot be told. */
function sceneHasCamera(scene: Scene, name: string): boolean | null {
  const s = scene as unknown as { hasCamera?: (n: string) => boolean };
  if (typeof s.hasCamera !== "function") return null;
  try {
    return s.hasCamera(name);
  } catch {
    return null;
  }
}

/** Write a start-camera name back, ignoring a scene that has gone away. */
function restoreStartCam(animMgr: AnimMgr, value: string): void {
  try {
    animMgr.startcam = value;
  } catch {
    /* the scene may be gone by the time the job unwinds */
  }
}

/**
 * Point the animation at a start camera the render can use, returning the name
 * it replaced (null when nothing was replaced).
 *
 * The Animation panel's start camera is the user's choice and is used as-is.
 * It is only stood in for when there is nothing to start from -- unset, or
 * naming a camera the scene no longer has. AnimMgr then falls back to the
 * scene's active view, which an offline render does not have, and ends up
 * inventing a default camera that makes every frame meaningless
 * (AnimMgr::startImpl, src/qsys/anim/AnimMgr.cpp). renderStart captured the
 * render target's view into "__current" for exactly that case.
 *
 * The replacement is undone by stopAnim: `startcam` is persisted scene state,
 * not a render setting.
 */
function overrideStartCamForRender(scene: Scene, animMgr: AnimMgr): string | null {
  let startcam = "";
  try {
    startcam = animMgr.startcam ?? "";
  } catch {
    /* unreadable -- treat as unset */
  }
  // An explicit choice stands, unless the scene has since lost that camera.
  if (startcam && sceneHasCamera(scene, startcam) !== false) return null;
  // Nothing usable to fall back to either: leave the animation alone rather
  // than rewrite it to a camera that does not exist.
  if (sceneHasCamera(scene, CURRENT_CAM_NAME) === false) return null;
  try {
    animMgr.startcam = CURRENT_CAM_NAME;
  } catch {
    return null;
  }
  return startcam;
}

/**
 * Start the current frame, reusing the still pipeline's fields so pollJob
 * drives it unchanged: an in-process backend gets a poll handle, an
 * external-process backend gets its render tasks queued.
 */
function submitAnimFrame(
  ctx: WorkerContext,
  backend: RenderBackend,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  if (backend.beginInProcessAnimFrame) {
    submitInProcessAnimFrame(ctx, backend, entry, args);
    return;
  }

  const anim = entry.anim!;
  // This path only runs for a full render, where scene / animMgr are set.
  const exported = backend.exportAnimFrame!(
    ctx,
    anim.scene!,
    anim.animMgr!,
    args.snapshot,
    entry.workDir,
    anim.currFrame,
  );

  const tasks = backend.buildTasks(exported, args.snapshot, args.binaries);
  const renderSpecs = tasks.filter((t) => t.kind === "render");
  if (renderSpecs.length === 0) throw new Error("backend produced no render tasks");

  // Fail on the first frame rather than after queueing a whole sequence.
  if (anim.currFrame === 0) {
    for (const exe of new Set(tasks.map((t) => t.exe))) {
      if (!fs.existsSync(exe)) throw new Error(`Executable not found: ${exe}`);
    }
  }

  const pm = ctx.svc.getService("ProcessManager") as ProcessManager;
  if (renderSpecs.length > pm.getSlotSize()) {
    pm.setSlotSize(renderSpecs.length);
  }
  const taskIds: number[] = [];
  for (const t of renderSpecs) {
    const tid = pm.queueTask(t.exe, t.args, "");
    if (tid < 0) throw new Error("ProcessManager could not queue a render task");
    taskIds.push(tid);
  }

  entry.outputPath = backend.outputImagePath(exported);
  entry.phase = "render";
  entry.finalizeSpecs = tasks.filter((t) => t.kind === "finalize");
  entry.taskIds = taskIds;
  entry.taskProgress = taskIds.map(() => 0);
}

/**
 * Start the current frame on an in-process backend (umbreon): the ray trace
 * runs on a background C++ thread and the poll loop drives it through the
 * handle, exactly as a still in-process render.
 *
 * The frame image goes to one fixed path inside the working dir --
 * `advanceAnimFrame` moves it into the output folder as soon as it is done, so
 * the name can be reused by every frame.
 */
function submitInProcessAnimFrame(
  ctx: WorkerContext,
  backend: RenderBackend,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  const anim = entry.anim!;
  entry.outputPath = path.join(entry.workDir, "frame.png");
  entry.phase = "render";
  entry.finalizeSpecs = [];
  entry.taskIds = [];
  entry.taskProgress = [];
  entry.lastPhaseName = "";
  entry.lastPhaseAt = 0;
  entry.inProcess = backend.beginInProcessAnimFrame!(
    ctx,
    anim.animMgr!,
    args.snapshot,
    entry.outputPath,
  );
}

/** Finish an animation job: stop the animation and report the last frame. */
function finishAnimJob(
  ctx: WorkerContext,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  const anim = entry.anim!;
  stopTimer(entry);
  jobs.delete(entry.jobId);
  stopAnim(entry);
  cleanupDir(entry.workDir);

  // The frame sequence is the real output; the last frame stands in as the
  // result image so the window has something to show.
  const lastFrame = anim.framePaths[anim.framePaths.length - 1];
  const { width, height } = pixelImageSize(args.snapshot.commonProps);
  try {
    fs.accessSync(lastFrame);
    emit(ctx, {
      type: "complete",
      jobId: entry.jobId,
      imagePath: lastFrame,
      width,
      height,
      elapsedSec: (Date.now() - entry.startedAt) / 1000,
      movie: {
        frameCount: anim.framePaths.length,
        outputDir: anim.outputDir,
        baseName: anim.baseName,
        ...(anim.moviePath ? { moviePath: anim.moviePath } : {}),
      },
    });
  } catch (e) {
    emit(ctx, {
      type: "error",
      jobId: entry.jobId,
      error: `Frames not produced: ${String(e)}`,
    });
  }
}

/**
 * The current frame finished: move its image into the output folder and
 * either start the next frame or finish the job.
 */
function advanceAnimFrame(
  ctx: WorkerContext,
  backend: RenderBackend,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  const anim = entry.anim!;
  const dest = path.join(
    anim.outputDir,
    movieFrameFileName(anim.baseName, anim.currFrame),
  );
  try {
    fs.renameSync(entry.outputPath, dest);
  } catch {
    // rename fails across devices; fall back to copy + remove.
    fs.copyFileSync(entry.outputPath, dest);
    fs.rmSync(entry.outputPath, { force: true });
  }
  anim.framePaths.push(dest);
  const finishedIndex = anim.currFrame;
  anim.currFrame += 1;
  const wasLast = anim.currFrame >= anim.frameCount;

  // Live preview of the frame just finished. The last frame is skipped
  // because finishAnimJob reports it as the result image straight after.
  const now = Date.now();
  if (!wasLast && now - anim.lastPreviewAt >= PREVIEW_MIN_INTERVAL_MS) {
    anim.lastPreviewAt = now;
    try {
      const size = pixelImageSize(args.snapshot.commonProps);
      emit(ctx, {
        type: "framePreview",
        jobId: entry.jobId,
        frameIndex: finishedIndex,
        dataUrl: `data:image/png;base64,${fs.readFileSync(dest).toString("base64")}`,
        width: size.width,
        height: size.height,
      });
    } catch {
      /* the preview is best-effort; the render itself carries on */
    }
  }

  if (wasLast) {
    // All frames are on disk. Encode them if asked, otherwise finish.
    if (shouldEncode(args)) startEncode(ctx, entry, args);
    else finishAnimJob(ctx, entry, args);
    return;
  }

  emit(
    ctx,
    progressUpdate(entry, "running", `Frame ${anim.currFrame + 1} / ${anim.frameCount}\n`, 0),
  );
  submitAnimFrame(ctx, backend, entry, args);
}

/**
 * Whether this job should encode a movie. ffmpeg itself is checked before the
 * first frame is rendered (see resolveFfmpeg / startAnimJob), so by the time
 * the sequence is done the binary is known to be usable.
 */
function shouldEncode(args: RenderStartArgs): boolean {
  return Boolean(args.snapshot.movie?.makeMovie);
}

/**
 * Resolve the configured ffmpeg binary, or say why it cannot be used.
 *
 * Checked up front rather than at encode time: an animation render can take
 * hours, and discovering only then that the encoder is missing wastes all of
 * it. A missing path is an error rather than a silent skip -- "render the
 * frames but no movie" is what the Encode movie switch is for.
 */
function resolveFfmpeg(args: RenderStartArgs): { path: string } | { error: string } {
  const configured = args.binaries.ffmpeg?.trim();
  if (!configured) {
    return { error: "No ffmpeg executable is configured (Settings > Rendering)" };
  }
  const exe = expandHomePath(configured);
  if (!fs.existsSync(exe)) return { error: `ffmpeg not found: ${exe}` };
  return { path: exe };
}

/**
 * Delete a base name's frame images and encoded movies from a folder.
 *
 * Run before an animation render so the folder describes exactly one sequence.
 * Frames left by an earlier, longer render would otherwise survive past the new
 * sequence's end, where they inflate the re-encode frame count and -- if that
 * render used a different image size -- make ffmpeg abort partway.
 *
 * @returns how many files were removed.
 */
function purgeMovieArtifacts(outputDir: string, baseName: string): number {
  const frameRe = frameFileRegExp(baseName);
  const movieNames = movieFileNames(baseName);
  let removed = 0;
  let names: string[];
  try {
    names = fs.readdirSync(outputDir);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!frameRe.test(name) && !movieNames.has(name)) continue;
    try {
      fs.rmSync(path.join(outputDir, name), { force: true });
      removed++;
    } catch {
      /* leave files we cannot remove; the render overwrites what it reaches */
    }
  }
  return removed;
}

/** ffmpeg options for this job, from the frames on disk and the snapshot. */
function encodeOptions(entry: RenderJobEntry, args: RenderStartArgs): FfmpegEncodeOptions {
  const anim = entry.anim!;
  const movie = args.snapshot.movie!;
  return {
    outputDir: anim.outputDir,
    baseName: anim.baseName,
    fps: movie.fps,
    frameCount: anim.framePaths.length,
    format: movie.movieFormat,
    bitrateKbps: movie.bitrateKbps,
  };
}

/** Queue the ffmpeg encode task and move the job into its encoding phase. */
function startEncode(
  ctx: WorkerContext,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  const anim = entry.anim!;
  const resolved = resolveFfmpeg(args);
  if ("error" in resolved) {
    stopTimer(entry);
    jobs.delete(entry.jobId);
    stopAnim(entry);
    cleanupDir(entry.workDir);
    emit(ctx, { type: "error", jobId: entry.jobId, error: resolved.error });
    return;
  }

  const opts = encodeOptions(entry, args);
  // Clear the target first: ProcessManager reports no exit code, so "did the
  // file appear" is how pollEncode tells a finished encode from a failed one.
  // Left in place, a previous render's movie would pass for this one's.
  fs.rmSync(movieOutputPath(opts), { force: true });

  const pm = ctx.svc.getService("ProcessManager") as ProcessManager;
  const tid = pm.queueTask(resolved.path, buildFfmpegArgs(opts), "");
  if (tid < 0) {
    stopTimer(entry);
    jobs.delete(entry.jobId);
    stopAnim(entry);
    cleanupDir(entry.workDir);
    emit(ctx, { type: "error", jobId: entry.jobId, error: "Could not queue the ffmpeg task" });
    return;
  }

  anim.encodeTid = tid;
  anim.moviePath = movieOutputPath(opts);
  anim.encodeLog = "";
  emit(ctx, progressUpdate(entry, "encoding", "Encoding movie\n", 100));
}

/** Longest ffmpeg output tail kept for a failure message. */
const ENCODE_LOG_TAIL = 600;

/** Poll the ffmpeg encode task; finish the job once it ends. */
function pollEncode(
  ctx: WorkerContext,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  const anim = entry.anim!;
  const pm = ctx.svc.getService("ProcessManager") as ProcessManager;
  const tid = anim.encodeTid!;
  const status = pm.getTaskStatus(tid);
  const out = pm.getResultOutput(tid); // also releases the slot on end
  const logChunk = out || undefined;
  if (out) anim.encodeLog = (anim.encodeLog + out).slice(-ENCODE_LOG_TAIL);

  if (status === TASK_QUEUED || status === TASK_RUNNING) {
    emit(ctx, progressUpdate(entry, "encoding", logChunk ?? ""));
    return;
  }

  // ProcessManager exposes no exit code, so the movie file is the verdict --
  // startEncode removed any earlier one, so its presence means this run wrote
  // it. Without this check a failed encode was reported as a success and the
  // window offered whatever movie happened to be at that path.
  if (anim.moviePath && !fs.existsSync(anim.moviePath)) {
    stopTimer(entry);
    jobs.delete(entry.jobId);
    stopAnim(entry);
    cleanupDir(entry.workDir);
    const detail = anim.encodeLog.trim();
    emit(ctx, {
      type: "error",
      jobId: entry.jobId,
      error: `The movie could not be encoded${detail ? `: ${detail}` : " (see the log)"}`,
    });
    return;
  }
  finishAnimJob(ctx, entry, args);
}

/**
 * One render unit finished. A still job completes here; an animation job
 * banks the frame and starts the next one.
 */
function completeUnit(
  ctx: WorkerContext,
  backend: RenderBackend,
  entry: RenderJobEntry,
  args: RenderStartArgs,
): void {
  if (entry.anim) advanceAnimFrame(ctx, backend, entry, args);
  else finishJob(ctx, entry, args);
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

/**
 * Build a progress update.
 *
 * `progress` is always the whole job's: for a movie that is the finished
 * frames plus the current frame's share, so the bar advances once across the
 * sequence instead of resetting on every frame. The current frame's own
 * progress rides alongside it as `frameProgress`.
 */
function progressUpdate(
  entry: RenderJobEntry,
  phase: RenderUpdatePhase,
  logChunk: string,
  frameProgressOverride?: number,
): RenderUpdate {
  const frameProgress = frameProgressOverride ?? mean(entry.taskProgress);
  const anim = entry.anim;
  return {
    type: "progress",
    jobId: entry.jobId,
    progress: anim
      ? Math.round(((anim.currFrame + frameProgress / 100) / anim.frameCount) * 100)
      : frameProgress,
    phase,
    ...(anim
      ? { frameIndex: anim.currFrame, frameCount: anim.frameCount, frameProgress }
      : {}),
    logChunk: logChunk || undefined,
  };
}

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

/** One poll tick. */
function pollJob(
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

/**
 * Register and drive an in-process (C++) render job -- e.g. umbreon, which
 * renders on a background thread rather than spawning external processes. No
 * ProcessManager task is queued.
 *
 * `beginInProcess` builds the scene (on this worker thread) and kicks the ray
 * trace onto a background C++ thread, returning a handle at once. A poll timer
 * then pushes `render-progress` updates and, once the render finishes, joins the
 * worker and writes the image via the handle's `finish()`. Because the first
 * push lands on a later timer tick (never synchronously inside renderStart),
 * `useRenderJob` has already stored the jobId -- no jobId race.
 */
function startInProcessJob(
  ctx: WorkerContext,
  backend: RenderBackend,
  scene: Scene,
  args: RenderStartArgs,
  workDir: string,
  outputPath: string,
): RenderStartResult {
  let handle: InProcessRender;
  try {
    // Non-blocking: builds the scene, then starts the ray trace on a bg thread.
    handle = backend.beginInProcess!(ctx, scene, args.snapshot, outputPath);
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
    finalizeSpecs: [],
    taskIds: [],
    taskProgress: [],
    inProcess: handle,
    lastPhaseName: "",
    lastPhaseAt: 0,
    anim: null,
  };
  jobs.set(jobId, entry);

  entry.timer = setInterval(() => {
    try {
      pollInProcessJob(ctx, backend, entry, args);
    } catch (e) {
      stopTimer(entry);
      jobs.delete(jobId);
      cleanupDir(workDir);
      emit(ctx, { type: "error", jobId, error: String(e) });
    }
  }, IN_PROCESS_POLL_MS);

  return { ok: true, jobId };
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
function pollInProcessJob(
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

/**
 * Start an animation render: set up AnimMgr for offline rendering, then
 * start the first frame. Subsequent frames are started by the poll loop.
 */
function startAnimJob(
  ctx: WorkerContext,
  backend: RenderBackend,
  scene: Scene,
  args: RenderStartArgs,
  workDir: string,
): RenderStartResult {
  // Set once the start camera has been stood in for; every exit below puts it
  // back, and the job entry takes over that duty once it exists.
  let startCamMgr: AnimMgr | null = null;
  let startCamBak: string | null = null;
  const fail = (error: string): RenderStartResult => {
    if (startCamMgr !== null && startCamBak !== null) {
      restoreStartCam(startCamMgr, startCamBak);
    }
    cleanupDir(workDir);
    return { ok: false, jobId: "", error };
  };

  if (!backend.exportAnimFrame && !backend.beginInProcessAnimFrame) {
    return fail(`The ${backend.id} backend cannot render animations`);
  }

  const movie = args.snapshot.movie;
  if (!movie) return fail("Movie settings are missing");

  const outputDir = movie.outputDir.trim();
  const baseName = resolveMovieBaseName(movie.baseName);
  const { fps, dupLastFrame } = movie;

  if (!outputDir) return fail("No output folder is set");
  if (!fs.existsSync(outputDir)) return fail(`Output folder not found: ${outputDir}`);

  // Fail before a single frame is rendered rather than after the whole
  // sequence, matching how the render executables are checked below.
  if (movie.makeMovie) {
    const resolved = resolveFfmpeg(args);
    if ("error" in resolved) return fail(resolved.error);
  }

  const animMgr = getAnimMgrOrNull(scene);
  if (!animMgr) return fail("Scene has no animation manager");
  if (animMgr.size <= 0) return fail("Scene has no animation to render");

  let frameCount: number;
  try {
    startCamMgr = animMgr;
    startCamBak = overrideStartCamForRender(scene, animMgr);
    frameCount = animMgr.setupRender(
      makeTimeValue(ctx, 0),
      makeTimeValue(ctx, animMgr.length.millisec),
      fps,
    );
  } catch (e) {
    return fail(`Cannot set up the animation render: ${String(e)}`);
  }

  // UXP's "Loop" checkbox: dropping the last frame makes the sequence loop
  // cleanly, since the first and last frames are otherwise identical.
  if (!dupLastFrame) frameCount -= 1;
  if (frameCount <= 0) {
    try {
      animMgr.stop();
    } catch {
      /* ignore */
    }
    return fail("The animation has no frames to render");
  }

  const jobId = `render-${Date.now()}`;
  const entry: RenderJobEntry = {
    jobId,
    workDir,
    outputPath: "",
    startedAt: Date.now(),
    timer: null,
    cancelled: false,
    announcedDir: false,
    phase: "render",
    finalizeSpecs: [],
    taskIds: [],
    taskProgress: [],
    inProcess: null,
    lastPhaseName: "",
    lastPhaseAt: 0,
    anim: {
      animMgr,
      scene,
      frameCount,
      currFrame: 0,
      outputDir,
      baseName,
      framePaths: [],
      lastPreviewAt: 0,
      encodeTid: null,
      moviePath: null,
      encodeLog: "",
      startCamBak,
    },
  };
  jobs.set(jobId, entry);
  // The entry owns the restore from here on (stopAnim runs on every exit).
  startCamBak = null;

  // Start from an empty sequence: a previous render's frames past this one's
  // end would otherwise stay in the folder and be taken for part of it.
  const purged = purgeMovieArtifacts(outputDir, baseName);
  if (purged > 0) {
    emit(ctx, {
      type: "progress",
      jobId,
      progress: 0,
      phase: "exporting",
      logChunk: `Removed ${purged} file(s) from an earlier render of "${baseName}"\n`,
    });
  }

  try {
    submitAnimFrame(ctx, backend, entry, args);
  } catch (e) {
    stopAnim(entry);
    jobs.delete(jobId);
    cleanupDir(workDir);
    return { ok: false, jobId: "", error: String(e) };
  }

  entry.timer = setInterval(
    () => {
      try {
        pollJob(ctx, backend, entry, args);
      } catch (e) {
        stopTimer(entry);
        jobs.delete(jobId);
        stopAnim(entry);
        cleanupDir(workDir);
        emit(ctx, { type: "error", jobId, error: String(e) });
      }
    },
    // An in-process frame reports continuous progress, so it is polled at the
    // tighter still-render rate (see IN_PROCESS_POLL_MS).
    backend.beginInProcessAnimFrame ? IN_PROCESS_POLL_MS : POLL_MS,
  );

  return { ok: true, jobId };
}

/**
 * Re-encode: skip rendering and run ffmpeg over an already-rendered frame
 * sequence on disk. Reuses the encode phase (startEncode / pollEncode /
 * finishAnimJob) with a job whose frames are all "already done".
 */
function startEncodeOnlyJob(
  ctx: WorkerContext,
  args: RenderStartArgs,
): RenderStartResult {
  const movie = args.snapshot.movie;
  if (!movie) return { ok: false, jobId: "", error: "Movie settings are missing" };

  const outputDir = movie.outputDir.trim();
  const baseName = resolveMovieBaseName(movie.baseName);
  const frameCount = args.encodeOnly?.frameCount ?? 0;
  if (!outputDir || !fs.existsSync(outputDir)) {
    return { ok: false, jobId: "", error: `Output folder not found: ${outputDir}` };
  }
  if (frameCount <= 0) return { ok: false, jobId: "", error: "No frames to encode" };

  // The frames already exist; list their paths so finishAnimJob can report
  // the last one as the result image.
  const framePaths = Array.from({ length: frameCount }, (_, i) =>
    path.join(outputDir, movieFrameFileName(baseName, i)),
  );

  // An empty temp dir stands in for the (unused) render working dir, so the
  // finish/cancel cleanup never touches the user's output folder.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cuemol-encode-"));
  const jobId = `render-${Date.now()}`;
  const entry: RenderJobEntry = {
    jobId,
    workDir,
    outputPath: "",
    startedAt: Date.now(),
    timer: null,
    cancelled: false,
    announcedDir: false,
    phase: "render",
    finalizeSpecs: [],
    taskIds: [],
    taskProgress: [],
    inProcess: null,
    lastPhaseName: "",
    lastPhaseAt: 0,
    anim: {
      animMgr: null,
      scene: null,
      frameCount,
      currFrame: frameCount,
      outputDir,
      baseName,
      framePaths,
      lastPreviewAt: 0,
      encodeTid: null,
      moviePath: null,
      encodeLog: "",
      startCamBak: null,
    },
  };
  jobs.set(jobId, entry);

  startEncode(ctx, entry, args);
  if (!jobs.has(jobId)) {
    // startEncode already emitted an error and cleaned up (e.g. ffmpeg missing).
    return { ok: false, jobId: "", error: "Could not start the encode" };
  }

  entry.timer = setInterval(() => {
    try {
      // encodeTid is already set, so pollJob branches straight to pollEncode
      // and never touches the backend.
      pollJob(ctx, null as unknown as RenderBackend, entry, args);
    } catch (e) {
      stopTimer(entry);
      jobs.delete(jobId);
      cleanupDir(workDir);
      emit(ctx, { type: "error", jobId, error: String(e) });
    }
  }, POLL_MS);

  return { ok: true, jobId };
}

/** Start a render job. */
function renderStart(ctx: WorkerContext, args: RenderStartArgs): RenderStartResult {
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
function renderCancel(ctx: WorkerContext, args: RenderCancelArgs): RenderCancelResult {
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
