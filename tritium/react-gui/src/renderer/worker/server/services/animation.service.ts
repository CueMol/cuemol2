/**
 * @file services/animation.service.ts
 * @description Read the per-scene CueMol animation manager (`AnimMgr`) for the
 * Blender-style timeline panel.
 *
 * `AnimMgr` owns an ordered list of time-ranged `AnimObj` elements -- each a
 * strip spanning `absStart`..`absEnd`, all times in milliseconds. UXP's
 * `anim-panel.js` reads these one wrapper call at a time; here the iteration is
 * folded into a single worker-side loop so the renderer sees one round trip per
 * refresh (same approach as `getSeqPanelData.service.ts`).
 *
 * This phase is read-only (list + manager snapshot). Playback control
 * (`start`/`goTime`/...) and editing (`setElementTime`/`addElement`/...) land in
 * later phases.
 */

import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { TimeValue } from "@cuemol/core/src/wrappers/TimeValue";
import type { WorkerContext } from "../types/WorkerContext";
import type { AnimElement, AnimMgrState, AnimTimeline } from "../../../types";
import { getSceneOrNull, getViewOrNull } from "./helpers/sceneResolver";
import { classNameToType } from "./helpers/animElementType";

/** Renderer-side default fps for the ms<->frame ruler readout. */
const DEFAULT_FPS = 30;

export interface AnimListTimelineArgs {
  sceneId: number;
}

export interface AnimGetMgrStateArgs {
  sceneId: number;
}

export interface AnimPlayArgs {
  sceneId: number;
  /** Target view the animation drives (start/goTime require a View). */
  viewId: number;
}

export interface AnimPauseArgs {
  sceneId: number;
}

export interface AnimStopArgs {
  sceneId: number;
}

export interface AnimGoTimeArgs {
  sceneId: number;
  viewId: number;
  /** Seek target in milliseconds (clamped to >= 0). */
  ms: number;
}

export interface AnimSetLoopArgs {
  sceneId: number;
  loop: boolean;
}

/** Result of a transport op: the post-mutation manager snapshot. */
export interface AnimTransportResult {
  ok: boolean;
  mgr: AnimMgrState;
}

// --- safe wrapper reads (a getter may throw for missing-on-subclass cases) ---

function safeNum(read: () => number): number {
  try {
    const v = read();
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function safeBool(read: () => boolean): boolean {
  try {
    return read() === true;
  } catch {
    return false;
  }
}

function safeStr(read: () => string): string {
  try {
    return read() ?? "";
  } catch {
    return "";
  }
}

/**
 * Map the `playState` enum to a stable string union.
 *
 * `playState` is declared `enum` in `AnimMgr.qif`; the generated wrapper types
 * it as `number` but the native layer returns the string id at runtime. Both
 * shapes are handled defensively.
 */
function readPlayState(mgr: AnimMgr): AnimMgrState["playState"] {
  let raw: unknown;
  try {
    raw = mgr.playState as unknown;
  } catch {
    return "stop";
  }
  if (raw === "play" || raw === "pause" || raw === "stop") return raw;
  // Numeric fallback: AM_STOP=0 / AM_RUNNING=1 / AM_PAUSED=2.
  if (raw === 1) return "play";
  if (raw === 2) return "pause";
  return "stop";
}

/** Read the manager-level snapshot (length / elapsed / play state / loop). */
function readMgrState(mgr: AnimMgr): AnimMgrState {
  return {
    lengthMs: safeNum(() => mgr.length.millisec),
    elapsedMs: safeNum(() => mgr.elapsed.millisec),
    playState: readPlayState(mgr),
    loop: safeBool(() => mgr.loop),
    startcam: safeStr(() => mgr.startcam),
  };
}

/** Read one `AnimObj` into an `AnimElement` (all times in ms). */
function readElement(obj: AnimObj, index: number): AnimElement {
  return {
    index,
    uid: safeNum(() => obj.uid),
    name: safeStr(() => obj.name),
    type: classNameToType(obj),
    disabled: safeBool(() => obj.disabled),
    timeRefName: safeStr(() => obj.timeRefName),
    startMs: safeNum(() => obj.start.millisec),
    endMs: safeNum(() => obj.end.millisec),
    absStartMs: safeNum(() => obj.absStart.millisec),
    absEndMs: safeNum(() => obj.absEnd.millisec),
    quadric: safeNum(() => obj.quadric),
  };
}

function getAnimMgrOrNull(scene: Scene): AnimMgr | null {
  try {
    return (scene.getAnimMgr() as AnimMgr | null) ?? null;
  } catch {
    return null;
  }
}

const EMPTY_MGR_STATE: AnimMgrState = {
  lengthMs: 0,
  elapsedMs: 0,
  playState: "stop",
  loop: false,
  startcam: "",
};

/**
 * List every `AnimObj` in the scene's `AnimMgr` as timeline strips.
 *
 * Resolves relative->absolute times first (a cyclic/missing `timeRefName`
 * makes `resolveRelTime()` throw; that is swallowed so one bad element cannot
 * blank the whole panel). Returns an empty timeline when the scene or manager
 * is unavailable.
 */
function listTimeline(ctx: WorkerContext, args: AnimListTimelineArgs): AnimTimeline {
  const empty: AnimTimeline = {
    sceneId: args.sceneId,
    elements: [],
    mgr: EMPTY_MGR_STATE,
    fps: DEFAULT_FPS,
  };

  const scene = getSceneOrNull(ctx, args.sceneId);
  if (!scene) return empty;
  const mgr = getAnimMgrOrNull(scene);
  if (!mgr) return empty;

  // Resolve before reading absStart/absEnd. Leave prior abs values on throw.
  try {
    mgr.resolveRelTime();
  } catch {
    /* keep previously-resolved absolute times */
  }

  const elements: AnimElement[] = [];
  const size = safeNum(() => mgr.size);
  for (let i = 0; i < size; i++) {
    let obj: AnimObj | null;
    try {
      obj = mgr.getAt(i) as AnimObj | null;
    } catch {
      continue;
    }
    if (!obj) continue;
    elements.push(readElement(obj, i));
  }

  return {
    sceneId: args.sceneId,
    elements,
    mgr: readMgrState(mgr),
    fps: DEFAULT_FPS,
  };
}

/** Cheap manager-only snapshot (poll target for playback in later phases). */
function getMgrState(ctx: WorkerContext, args: AnimGetMgrStateArgs): AnimMgrState {
  const scene = getSceneOrNull(ctx, args.sceneId);
  if (!scene) return EMPTY_MGR_STATE;
  const mgr = getAnimMgrOrNull(scene);
  if (!mgr) return EMPTY_MGR_STATE;
  return readMgrState(mgr);
}

// --- Transport (playback / scrub) ---
//
// Playback ops are transient view-state (the same as mouse navigation) and are
// intentionally NOT wrapped in an undo transaction. `start(view)` registers the
// animation with the C++ event loop, which drives the view camera every tick;
// the worker's existing per-frame redraw loop renders it -- no per-frame call
// is needed here. Each op returns the post-mutation manager snapshot so the
// renderer syncs play state / elapsed in a single round trip.

/** Resolve the scene's AnimMgr, or null. */
function resolveMgr(ctx: WorkerContext, sceneId: number): AnimMgr | null {
  const scene = getSceneOrNull(ctx, sceneId);
  if (!scene) return null;
  return getAnimMgrOrNull(scene);
}

function fail(): AnimTransportResult {
  return { ok: false, mgr: EMPTY_MGR_STATE };
}

/** Start (or resume) playback on the target view. */
function play(ctx: WorkerContext, args: AnimPlayArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return fail();
  const view = getViewOrNull(ctx, args.viewId);
  if (!view) return { ok: false, mgr: readMgrState(mgr) };
  try {
    mgr.start(view);
  } catch {
    return { ok: false, mgr: readMgrState(mgr) };
  }
  return { ok: true, mgr: readMgrState(mgr) };
}

/** Pause playback (keeps elapsed; resumable via play). */
function pause(ctx: WorkerContext, args: AnimPauseArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return fail();
  try {
    mgr.pause();
  } catch {
    return { ok: false, mgr: readMgrState(mgr) };
  }
  return { ok: true, mgr: readMgrState(mgr) };
}

/** Stop playback and rewind to 0. */
function stop(ctx: WorkerContext, args: AnimStopArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return fail();
  try {
    mgr.stop();
  } catch {
    return { ok: false, mgr: readMgrState(mgr) };
  }
  return { ok: true, mgr: readMgrState(mgr) };
}

/** Seek to a time (ms) and pause there; updates the view camera. */
function goTime(ctx: WorkerContext, args: AnimGoTimeArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return fail();
  const view = getViewOrNull(ctx, args.viewId);
  if (!view) return { ok: false, mgr: readMgrState(mgr) };
  const tv = ctx.svc.createObj("TimeValue") as TimeValue | null;
  if (!tv) return { ok: false, mgr: readMgrState(mgr) };
  tv.millisec = Math.max(0, args.ms);
  try {
    mgr.goTime(tv, view);
  } catch {
    return { ok: false, mgr: readMgrState(mgr) };
  }
  return { ok: true, mgr: readMgrState(mgr) };
}

/** Toggle loop mode. */
function setLoop(ctx: WorkerContext, args: AnimSetLoopArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return fail();
  try {
    mgr.loop = args.loop;
  } catch {
    return { ok: false, mgr: readMgrState(mgr) };
  }
  return { ok: true, mgr: readMgrState(mgr) };
}

export const services = {
  animListTimeline: listTimeline,
  animGetMgrState: getMgrState,
  animPlay: play,
  animPause: pause,
  animStop: stop,
  animGoTime: goTime,
  animSetLoop: setLoop,
};
