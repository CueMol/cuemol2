/**
 * @file worker/server/services/anim/transport.ts
 * @description Playback, and telling the renderer where it has got to.
 *
 * `AnimMgr` advances on a native timer and fires no event of its own, so
 * nothing observes playback unless something looks. The worker's frame loop
 * calls `pumpAnimProgress` right after pumping the C++ timers, and a scene
 * whose position moved is pushed at the renderer (throttled). That is why the
 * renderer does not poll for it.
 *
 * A scene is watched from the moment it starts playing until it stops, is
 * closed, or falls behind an inactive tab -- `pauseInactivePlayback`, which a
 * view activation calls, except for a scene that is being rendered.
 */
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { TimeValue } from "@cuemol/core/src/wrappers/TimeValue";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { AnimMgrState } from "@renderer/types";
import { getViewOrNull } from "@renderer/worker/server/services/helpers/sceneResolver";
import { fail, failFrom, ok } from "@renderer/worker/shared/result";
import { readAnimGraph, resolveMgr } from "./resolve";
import { ANIM_PROGRESS_CHANNEL, type AnimProgressUpdate } from "@renderer/worker/shared/animTypes";
import { readMgrState, readPlayState } from "./read";
import { describeResolveFailure } from "./timeRefGraph";
import { noMgrFail } from "./types";
import type {
  AnimGoTimeArgs,
  AnimPauseArgs,
  AnimPlayArgs,
  AnimSetLoopArgs,
  AnimSetStartCamArgs,
  AnimStopArgs,
  AnimTransportResult,
} from "./types";
// --- detail shapes ---

/**
 * Scenes whose animation is running, sampled on the render loop.
 *
 * C++ advances playback on its own timer and fires no per-frame event, so
 * something has to look. The worker already runs a frame loop that pumps that
 * timer, so it samples there and pushes what changed -- rather than the
 * renderer asking ~15 times a second, which is a round trip per sample and
 * kept asking whether or not anything had moved.
 *
 * Only the scene id is kept. Holding the manager wrapper instead would pin
 * the native object: a scene closed mid-playback stayed alive, kept its timer
 * running and kept drawing over whatever was opened next. The manager is
 * resolved from the live scene each frame, so a closed scene simply stops
 * resolving.
 */
interface PlayingScene {
  /** Last pushed snapshot, to send only what changed. */
  last: AnimMgrState | null;
  /** Timestamp of the last push, to cap the rate. */
  lastPushMs: number;
}

const playingScenes = new Map<number, PlayingScene>();

/** Minimum gap between pushes: smooth for a progress readout, cheap to send. */
const PROGRESS_MIN_GAP_MS = 66;

function samePosition(a: AnimMgrState | null, b: AnimMgrState): boolean {
  return (
    a !== null &&
    a.elapsedMs === b.elapsedMs &&
    a.playState === b.playState &&
    a.lengthMs === b.lengthMs &&
    a.loop === b.loop
  );
}

function postProgress(sceneId: number, mgr: AnimMgrState): void {
  const update: AnimProgressUpdate = { sceneId, mgr };
  (self as unknown as Worker).postMessage([ANIM_PROGRESS_CHANNEL, update]);
}

/**
 * Sample every playing scene and push what moved. Called once per frame by
 * the render loop, right after it pumps the C++ timer that advances playback.
 */
export function pumpAnimProgress(ctx: WorkerContext, now: number = Date.now()): void {
  if (playingScenes.size === 0) return;
  for (const [sceneId, entry] of [...playingScenes]) {
    const mgr = resolveMgr(ctx, sceneId);
    if (!mgr) {
      // The scene was closed; there is nothing left to report on.
      playingScenes.delete(sceneId);
      continue;
    }
    const state = readMgrState(mgr);
    // Playback that ended on its own gets one final push, then stops costing
    // anything: nothing will move again until the renderer asks it to.
    const ended = state.playState !== 'play';
    if (!ended && samePosition(entry.last, state)) continue;
    if (!ended && now - entry.lastPushMs < PROGRESS_MIN_GAP_MS) continue;
    entry.last = state;
    entry.lastPushMs = now;
    postProgress(sceneId, state);
    if (ended) playingScenes.delete(sceneId);
  }
}

/** Follow a scene's playback until it stops. */
function watchPlayback(sceneId: number): void {
  playingScenes.set(sceneId, { last: null, lastPushMs: 0 });
}

/** Stop following a scene; its own reply carries the final state. */
function unwatchPlayback(sceneId: number): void {
  playingScenes.delete(sceneId);
}

/** Stop following a scene that is being torn down. */
export function forgetAnimProgress(sceneId: number): void {
  playingScenes.delete(sceneId);
}

/** Drop every watch. Used when the worker tears down. */
export function clearAnimProgressWatches(): void {
  playingScenes.clear();
}

/**
 * Pause interactive playback in every scene except `activeSceneUid`.
 *
 * Only one view draws to the shared canvas, so an animation playing in a
 * background tab moves a camera nobody sees while its timer keeps firing.
 * Pausing keeps its position, so returning to the tab resumes from where it
 * was. Called on activation, so switching tabs is what pauses the one left
 * behind.
 *
 * `isProtected` names scenes whose manager something else is driving -- an
 * animation render steps it frame by frame on its own schedule -- and those
 * are left alone: pausing would stall the render. (A render never puts the
 * manager into the running state this checks for, so the predicate is a
 * second guard rather than the only one.)
 */
export function pauseInactivePlayback(
  ctx: WorkerContext,
  activeSceneUid: number | undefined,
  isProtected: (sceneUid: number) => boolean,
): number[] {
  const paused: number[] = [];
  let uids: string;
  try {
    uids = ctx.sceMgr.scene_uids;
  } catch {
    return paused;
  }
  if (!uids) return paused;
  for (const tok of uids.split(',')) {
    const uid = Number(tok.trim());
    if (!Number.isFinite(uid) || uid === activeSceneUid) continue;
    if (isProtected(uid)) continue;
    const mgr = resolveMgr(ctx, uid);
    if (!mgr || readPlayState(mgr) !== 'play') continue;
    try {
      mgr.pause();
      paused.push(uid);
    } catch (e) {
      console.warn(`pauseInactivePlayback: scene ${uid}:`, e);
    }
    // The watch stays: the next frame pushes the paused snapshot to the
    // renderer and drops it, the same way a finished animation does.
  }
  return paused;
}

/**
 * Refuse an op that needs the chain to resolve. C++ `start()` / `goTime()`
 * would throw on a cyclic or missing reference -- after `start()` has already
 * written its timing fields -- so the check runs first, with a reason.
 */
function unresolvedChain(mgr: AnimMgr, verb: string): string | null {
  const reason = describeResolveFailure(readAnimGraph(mgr).graph);
  return reason === null ? null : `Cannot ${verb}: ${reason}`;
}

/** Start (or resume) playback on the target view. */
export function play(ctx: WorkerContext, args: AnimPlayArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return noMgrFail();
  const view = getViewOrNull(ctx, args.viewId);
  if (!view) return fail("view not found", "not-found");
  const blocked = unresolvedChain(mgr, "play");
  if (blocked !== null) return fail(blocked, "invalid-args");
  try {
    mgr.start(view);
  } catch (e) {
    return failFrom(e, "native");
  }
  const state = readMgrState(mgr);
  if (state.playState === 'play') watchPlayback(args.sceneId);
  return ok({ mgr: state });
}

/** Pause playback (keeps elapsed; resumable via play). */
export function pause(ctx: WorkerContext, args: AnimPauseArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return noMgrFail();
  try {
    mgr.pause();
  } catch (e) {
    return failFrom(e, "native");
  }
  unwatchPlayback(args.sceneId);
  return ok({ mgr: readMgrState(mgr) });
}

/** Stop playback and rewind to 0. */
export function stop(ctx: WorkerContext, args: AnimStopArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return noMgrFail();
  try {
    mgr.stop();
  } catch (e) {
    return failFrom(e, "native");
  }
  unwatchPlayback(args.sceneId);
  return ok({ mgr: readMgrState(mgr) });
}

/** Seek to a time (ms) and pause there; updates the view camera. */
export function goTime(ctx: WorkerContext, args: AnimGoTimeArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return noMgrFail();
  const view = getViewOrNull(ctx, args.viewId);
  if (!view) return fail("view not found", "not-found");
  const blocked = unresolvedChain(mgr, "seek");
  if (blocked !== null) return fail(blocked, "invalid-args");
  const tv = ctx.svc.createObj("TimeValue") as TimeValue | null;
  if (!tv) return fail("TimeValue create failed", "native");
  tv.millisec = Math.max(0, args.ms);
  try {
    mgr.goTime(tv, view);
  } catch (e) {
    return failFrom(e, "native");
  }
  return ok({ mgr: readMgrState(mgr) });
}

/** Toggle loop mode. */
export function setLoop(ctx: WorkerContext, args: AnimSetLoopArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return noMgrFail();
  try {
    mgr.loop = args.loop;
  } catch (e) {
    return failFrom(e, "native");
  }
  return ok({ mgr: readMgrState(mgr) });
}

/**
 * Set the start camera (`AnimMgr.startcam`); '' clears it.
 *
 * The camera is applied when playback starts: `AnimMgr::init` looks the name up
 * on the scene and falls back to the view's current camera when it is empty or
 * unresolvable (`src/qsys/anim/AnimMgr.cpp`). No undo txn -- `setStartCamName`
 * is a plain field write that records nothing, so a txn would only be discarded
 * as empty (UXP `anim-panel.js` assigns it directly too). The name is stored
 * verbatim; a later camera delete leaves it dangling and C++ falls back.
 */
export function setStartCam(ctx: WorkerContext, args: AnimSetStartCamArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return noMgrFail();
  try {
    mgr.startcam = args.startcam;
  } catch (e) {
    return failFrom(e, "native");
  }
  return ok({ mgr: readMgrState(mgr) });
}
