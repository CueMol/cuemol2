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

import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { TimeValue } from "@cuemol/core/src/wrappers/TimeValue";
import type { WorkerContext } from "../types/WorkerContext";
import type { AnimAddType, AnimElement, AnimMgrState, AnimTimeline } from "@renderer/types";
import { getSceneOrNull, getViewOrNull } from "./helpers/sceneResolver";
import { classNameToType } from "./helpers/animElementType";
import {
  safeNum,
  safeBool,
  safeStr,
  getAnimMgrOrNull,
  resolveMgr,
  resolveSceneMgr,
  makeTimeValue,
  forEachAnimObj,
} from "./helpers/animResolve";
import { withUndoTxn } from "./withUndoTxn";

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

export interface AnimSetStartCamArgs {
  sceneId: number;
  /** Scene camera name applied before playback; '' = none (use the view camera). */
  startcam: string;
}

/** Result of a transport op: the post-mutation manager snapshot. */
export interface AnimTransportResult {
  ok: boolean;
  mgr: AnimMgrState;
}

export interface AnimSetElementTimeArgs {
  sceneId: number;
  index: number;
  /** RELATIVE start/end in ms (what AnimObj stores; abs is derived). */
  startMs: number;
  endMs: number;
}

export interface AnimAddElementArgs {
  sceneId: number;
  type: AnimAddType;
  /** Insert before this index; append when omitted or >= size. */
  insertIndex?: number;
  /**
   * Active view, used to seed the `__current` start camera (UXP parity).
   * Omitted when no view is active -- the start camera is then left alone.
   */
  viewId?: number;
}

export interface AnimRemoveElementArgs {
  sceneId: number;
  index: number;
}

export interface AnimMoveElementArgs {
  sceneId: number;
  from: number;
  /** Raw target index (UXP convention: i-1 to move up, i+1 to move down). */
  to: number;
}

export interface AnimEditResult {
  ok: boolean;
}

export interface AnimAddResult {
  ok: boolean;
  uid?: number;
  index?: number;
  /**
   * Post-add manager snapshot. An add can adopt the `__current` start camera
   * (see `ensureStartCam`), and that change fires no event the renderer could
   * listen for, so it is handed back the way the transport ops do.
   */
  mgr?: AnimMgrState;
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

const EMPTY_MGR_STATE: AnimMgrState = {
  lengthMs: 0,
  elapsedMs: 0,
  playState: "stop",
  loop: false,
  startcam: "",
};

/**
 * Scene camera names, for the start-camera selector (UXP `<camerasel>` items).
 *
 * Cameras are not part of `getSceneDataJSON`; `getCameraInfoJSON` is the only
 * source (see the scene-content JSON table in `tritium/CLAUDE.md`).
 */
function readCameraNames(scene: Scene): string[] {
  try {
    const arr = JSON.parse(scene.getCameraInfoJSON()) as Array<{ name?: string }>;
    return arr.map((c) => c?.name).filter((n): n is string => !!n);
  } catch {
    return [];
  }
}

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
    cameras: [],
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
  forEachAnimObj(mgr, (obj, i) => {
    elements.push(readElement(obj, i));
    return undefined;
  });

  return {
    sceneId: args.sceneId,
    elements,
    mgr: readMgrState(mgr),
    cameras: readCameraNames(scene),
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
function setStartCam(ctx: WorkerContext, args: AnimSetStartCamArgs): AnimTransportResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return fail();
  try {
    mgr.startcam = args.startcam;
  } catch {
    return { ok: false, mgr: readMgrState(mgr) };
  }
  return { ok: true, mgr: readMgrState(mgr) };
}

// --- Editing (move / resize / add / remove / reorder) ---
//
// Unlike the transient transport ops above, these mutate persistent scene state
// and are wrapped in `withUndoTxn` so the AnimMgr's internal UndoUtil records
// (created only while a txn is active) are captured as one undoable unit. They
// return only `{ ok }`; AnimMgr fires SEM_ADDED / SEM_REMOVING / SEM_PROPCHG, so
// the renderer's SEM_ANIM listener refetches the timeline.

/** Map an Add-menu type id to its concrete AnimObj class name. */
function classForAddType(type: AnimAddType): string {
  switch (type) {
    case "ShowAnim":
    case "HideAnim":
      return "ShowHideAnim";
    case "SlideInAnim":
    case "SlideOutAnim":
      return "SlideInOutAnim";
    default:
      return type; // SimpleSpin / CamMotion / MolAnim / NoopAnimObj
  }
}

/** Generate a unique element name `<base><n>` not already in the manager. */
function uniqueElementName(mgr: AnimMgr, base: string): string {
  for (let n = 0; n < 100000; n++) {
    const name = `${base}${n}`;
    let exists = false;
    try {
      exists = !!mgr.getByName(name);
    } catch {
      exists = false;
    }
    if (!exists) return name;
  }
  return `${base}_new`;
}

/** Apply UXP-equivalent per-type default props to a freshly created element. */
function applyAddTypeDefaults(obj: AnimObj, type: AnimAddType): void {
  const w = obj as unknown as Record<string, unknown>;
  switch (type) {
    case "SimpleSpin":
      w.angle = 360.0;
      break;
    case "ShowAnim":
      w.hide = false;
      break;
    case "HideAnim":
      w.hide = true;
      break;
    case "SlideInAnim":
      w.hide = false;
      break;
    case "SlideOutAnim":
      w.hide = true;
      break;
    case "MolAnim":
      w.prop = "frame";
      w.startValue = 0;
      w.endValue = 1;
      break;
    default:
      break; // CamMotion / NoopAnimObj: no scalar defaults (target set in inspector)
  }
}

/** Set an element's relative start/end (ms) and re-resolve absolute times. */
function setElementTime(
  ctx: WorkerContext,
  args: AnimSetElementTimeArgs,
): AnimEditResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return { ok: false };
  const { scene, mgr } = sm;
  // Keep start <= end defensively (the renderer also pre-clamps).
  const s = Math.min(args.startMs, args.endMs);
  const e = Math.max(args.startMs, args.endMs);
  try {
    withUndoTxn(scene, "Move animation element", () => {
      const obj = mgr.getAt(args.index) as AnimObj | null;
      if (!obj) throw new Error("bad index");
      const tvS = makeTimeValue(ctx, s);
      const tvE = makeTimeValue(ctx, e);
      if (!tvS || !tvE) throw new Error("TimeValue create failed");
      obj.start = tvS;
      obj.end = tvE;
      mgr.resolveRelTime();
    });
  } catch {
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Name of the implicit "camera the user is looking through" (UXP convention;
 * also written by its file-open / image-export paths).
 */
const CURRENT_CAM_NAME = "__current";

/**
 * Seed the start camera from the live view when an element is added.
 *
 * UXP `anim-panel.js` onAddCmd, verbatim: the `__current` camera is saved from
 * the active view whenever the scene lacks it, and `startcam` adopts it only
 * when still empty (an explicit choice is never overwritten). Without this a
 * fresh animation starts from wherever the camera happens to be at Play time
 * instead of from the view the elements were authored against.
 *
 * Runs OUTSIDE the add's undo txn, as in UXP: neither `saveViewToCam` nor
 * `setStartCamName` belongs to the element edit, so undoing the add leaves both
 * in place. Any failure is swallowed -- a camera problem must not block the add.
 */
function ensureStartCam(scene: Scene, mgr: AnimMgr, viewId: number | undefined): void {
  if (viewId === undefined) return;
  try {
    if (!scene.hasCamera(CURRENT_CAM_NAME)) scene.saveViewToCam(viewId, CURRENT_CAM_NAME);
    // Never point startcam at a camera the save failed to create.
    if (!scene.hasCamera(CURRENT_CAM_NAME)) return;
    if (safeStr(() => mgr.startcam) === "") mgr.startcam = CURRENT_CAM_NAME;
  } catch {
    /* camera seeding is best-effort */
  }
}

/** Create a new element, auto-chained to the preceding one, and insert it. */
function addElement(ctx: WorkerContext, args: AnimAddElementArgs): AnimAddResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return { ok: false };
  const { scene, mgr } = sm;
  const className = classForAddType(args.type);
  ensureStartCam(scene, mgr, args.viewId);
  let uid: number | undefined;
  let index: number | undefined;
  try {
    withUndoTxn(scene, "Add animation element", () => {
      const obj = ctx.svc.createObj(className) as AnimObj | null;
      if (!obj) throw new Error("createObj failed");
      obj.name = uniqueElementName(mgr, className);

      const size = mgr.size;
      const insertAt =
        args.insertIndex !== undefined && args.insertIndex < size
          ? args.insertIndex
          : size;

      // Auto-chain to the element preceding the insertion point (UXP parity).
      const refIdx = insertAt - 1;
      if (refIdx >= 0) {
        const ref = mgr.getAt(refIdx) as AnimObj | null;
        if (ref) obj.timeRefName = ref.name;
      }

      const tvS = makeTimeValue(ctx, 0);
      const tvE = makeTimeValue(ctx, 1000);
      if (!tvS || !tvE) throw new Error("TimeValue create failed");
      obj.start = tvS;
      obj.end = tvE;
      applyAddTypeDefaults(obj, args.type);

      if (insertAt < size) mgr.insertBefore(insertAt, obj);
      else mgr.append(obj);
      mgr.resolveRelTime();
      uid = obj.uid;
      index = insertAt;
    });
  } catch {
    return { ok: false, mgr: readMgrState(mgr) };
  }
  return { ok: true, uid, index, mgr: readMgrState(mgr) };
}

/** Remove the element at `index`. */
function removeElement(
  ctx: WorkerContext,
  args: AnimRemoveElementArgs,
): AnimEditResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return { ok: false };
  const { scene, mgr } = sm;
  try {
    withUndoTxn(scene, "Delete animation element", () => {
      mgr.removeAt(args.index);
    });
  } catch {
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Reorder: remove the element at `from`, then re-insert at the raw `to` index
 * (UXP convention: removeAt(from) + insertBefore(to), append when to >= size).
 */
function moveElement(
  ctx: WorkerContext,
  args: AnimMoveElementArgs,
): AnimEditResult {
  if (args.from === args.to) return { ok: true };
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return { ok: false };
  const { scene, mgr } = sm;
  try {
    withUndoTxn(scene, "Reorder animation element", () => {
      const obj = mgr.getAt(args.from) as AnimObj | null;
      if (!obj) throw new Error("bad index");
      mgr.removeAt(args.from);
      if (args.to < mgr.size) mgr.insertBefore(args.to, obj);
      else mgr.append(obj);
      mgr.resolveRelTime();
    });
  } catch {
    return { ok: false };
  }
  return { ok: true };
}

export const services = {
  animListTimeline: listTimeline,
  animGetMgrState: getMgrState,
  animPlay: play,
  animPause: pause,
  animStop: stop,
  animGoTime: goTime,
  animSetLoop: setLoop,
  animSetStartCam: setStartCam,
  animSetElementTime: setElementTime,
  animAddElement: addElement,
  animRemoveElement: removeElement,
  animMoveElement: moveElement,
};
