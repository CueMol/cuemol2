/**
 * @file worker/server/services/renderjob/jobRegistry.ts
 * @description The in-flight jobs, and the teardown every exit path shares.
 *
 * Completion, failure and cancel all have to stop the same things -- the poll
 * timer and the animation -- so those live here rather than in whichever
 * machine happened to reach the end first.
 */
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { RenderUpdate } from "@renderer/worker/shared/renderTypes";
import { RENDER_PROGRESS_CHANNEL } from "@renderer/worker/shared/renderTypes";
import type { RenderJobEntry } from "./types";
export const jobs = new Map<string, RenderJobEntry>();

/**
 * Whether an animation render is driving `sceneUid`'s animation manager.
 *
 * A render steps the manager frame by frame from here, on the job's own
 * schedule; anything that pauses or stops playback (pausing a background
 * tab's animation, for one) has to leave such a scene alone or it would
 * stall the render.
 */
export function isSceneBeingRendered(sceneUid: number): boolean {
  for (const entry of jobs.values()) {
    if (entry.cancelled) continue;
    const scene = entry.anim?.scene;
    if (!scene) continue;
    let uid: number | undefined;
    try { uid = scene.uid; } catch { continue; }
    if (uid === sceneUid) return true;
  }
  return false;
}

/** Push a render update to the renderer. */
export function emit(ctx: WorkerContext, update: RenderUpdate): void {
  ctx.svc.pushMessage(RENDER_PROGRESS_CHANNEL, update);
}

export function stopTimer(entry: RenderJobEntry): void {
  if (entry.timer !== null) {
    clearInterval(entry.timer);
    entry.timer = null;
  }
}

/**
 * Stop the animation manager. This is what restores the scene properties the
 * animation overwrote, so it must run on every exit -- completion, error and
 * cancel alike. Safe to call more than once.
 */
export function stopAnim(entry: RenderJobEntry): void {
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

/** Write a start-camera name back, ignoring a scene that has gone away. */
export function restoreStartCam(animMgr: AnimMgr, value: string): void {
  try {
    animMgr.startcam = value;
  } catch {
    /* the scene may be gone by the time the job unwinds */
  }
}
