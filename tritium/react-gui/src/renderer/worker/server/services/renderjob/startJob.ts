/**
 * @file worker/server/services/renderjob/startJob.ts
 * @description Getting each kind of job to its first tick.
 *
 * The three starters are the branches of `renderStart`: an in-process render,
 * a movie, and an encode of frames that already exist. Each sets up its own
 * first unit of work and then hands the job to the shared poll loop.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { RenderStartArgs, RenderStartResult } from "@renderer/worker/shared/renderTypes";
import { type RenderBackend } from "./backends";
import { type InProcessRender } from "./backends/RenderBackend";
import { getAnimMgrOrNull } from "@renderer/worker/server/services/anim/resolve";
import { movieFrameFileName, resolveMovieBaseName } from "@shared/movieFrames";
import { resolveFfmpeg } from "./encodeSpec";
import { cleanupDir, purgeMovieArtifacts } from "./fsUtil";
import { pollInProcessJob } from "./inProcessJob";
import { pollJob } from "./jobLoop";
import { emit, jobs, restoreStartCam, stopAnim, stopTimer } from "./jobRegistry";
import { makeTimeValue, overrideStartCamForRender, startEncode, submitAnimFrame } from "./movieJob";
import { IN_PROCESS_POLL_MS, POLL_MS } from "./types";
import type { RenderJobEntry } from "./types";
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
export function startInProcessJob(
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
 * Start an animation render: set up AnimMgr for offline rendering, then
 * start the first frame. Subsequent frames are started by the poll loop.
 */
export function startAnimJob(
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
export function startEncodeOnlyJob(
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
