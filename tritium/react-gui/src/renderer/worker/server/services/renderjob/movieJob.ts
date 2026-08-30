/**
 * @file worker/server/services/renderjob/movieJob.ts
 * @description The movie job: frames, then the encode.
 *
 * One state machine, in one file, because it is one: rendering a frame either
 * leads to the next frame or to the encode phase, and the encode phase ends at
 * the same finish the last frame would have reached. Splitting the frames from
 * the encode puts a cycle between the two halves.
 *
 * The animation is driven by setting `AnimMgr` to a frame time and rendering
 * what the scene then shows, so the manager has to be stopped on every exit --
 * that is `stopAnim` in the registry, which also puts back the start camera
 * this had to replace.
 */
import * as fs from "fs";
import * as path from "path";
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { ProcessManager } from "@cuemol/core/src/wrappers/ProcessManager";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { TimeValue } from "@cuemol/core/src/wrappers/TimeValue";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { RenderStartArgs } from "@renderer/worker/shared/renderTypes";
import { type RenderBackend } from "./backends";
import { pixelImageSize } from "./backends/RenderBackend";
import { movieFrameFileName } from "@shared/movieFrames";
import { buildFfmpegArgs, movieOutputPath } from "./ffmpegEncode";
import { encodeOptions, resolveFfmpeg, shouldEncode } from "./encodeSpec";
import { cleanupDir } from "./fsUtil";
import { emit, jobs, stopAnim, stopTimer } from "./jobRegistry";
import { progressUpdate } from "./progress";
import { PREVIEW_MIN_INTERVAL_MS, TASK_QUEUED, TASK_RUNNING } from "./types";
import type { RenderJobEntry } from "./types";
/** Create a C++ TimeValue holding `ms` milliseconds. */
export function makeTimeValue(ctx: WorkerContext, ms: number): TimeValue {
  const tv = ctx.svc.createObj("TimeValue") as TimeValue | null;
  if (!tv) throw new Error("cannot create TimeValue");
  tv.millisec = Math.max(0, Math.round(ms));
  return tv;
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
export function overrideStartCamForRender(scene: Scene, animMgr: AnimMgr): string | null {
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
export function submitAnimFrame(
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
export function submitInProcessAnimFrame(
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
export function advanceAnimFrame(
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

/** Queue the ffmpeg encode task and move the job into its encoding phase. */
export function startEncode(
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
export function pollEncode(
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
