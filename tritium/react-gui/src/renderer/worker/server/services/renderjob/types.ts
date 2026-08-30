/**
 * @file worker/server/services/renderjob/types.ts
 * @description What one render job is made of, and the numbers that pace it.
 *
 * `RenderJobEntry` carries the fields for all four combinations of
 * (still | movie) x (external process | in-process thread), because a job can
 * be any of them and the poll loop is shared. Which fields are live is what
 * the phase and the `anim` / `inProcess` presence say.
 */
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import { type RenderTaskSpec, type InProcessRender } from "./backends/RenderBackend";
/** Poll interval for external process status / stdout. */
export const POLL_MS = 700;

/**
 * Poll interval for an in-process (umbreon) render. Shorter than POLL_MS: the
 * local ray tracer's progress advances continuously, so a tighter poll drives a
 * smoother bar. Each tick is a handful of lock-free C++ reads, so it is cheap.
 */
export const IN_PROCESS_POLL_MS = 250;

/** ProcessManager task states. */
export const TASK_QUEUED = 0;
export const TASK_RUNNING = 1;

/** Phase of a render job. */
export type JobPhase = "render" | "finalize";

/**
 * State of an in-flight animation render. The job renders one frame at a
 * time: each frame runs the same cycle as a still (render -> finalize for an
 * external backend, one poll handle for an in-process one), and the poll loop
 * starts the next frame instead of completing the job.
 */
export interface AnimJobState {
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
export const PREVIEW_MIN_INTERVAL_MS = 1000;

/** State of one in-flight render job. */
export interface RenderJobEntry {
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
