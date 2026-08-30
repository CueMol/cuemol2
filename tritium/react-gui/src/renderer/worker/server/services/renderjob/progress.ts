/**
 * @file worker/server/services/renderjob/progress.ts
 * @description Turning per-task and per-frame progress into one job figure.
 */
import type { RenderUpdate, RenderUpdatePhase } from "@renderer/worker/shared/renderTypes";
import type { RenderJobEntry } from "./types";
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
export function progressUpdate(
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
