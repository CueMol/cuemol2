/**
 * @file worker/server/services/anim/edit.ts
 * @description Changing the strip: add, remove, reorder, retime.
 *
 * Every one of these is a scene edit, so it goes through an undo transaction
 * and the panel refetches the timeline afterwards. Elements are addressed by
 * their stable uid: the strip index the panel drew from is stale as soon as
 * anything is added, removed or reordered underneath it.
 *
 * None of these calls `resolveRelTime` itself. C++ `AnimMgr::update()` runs
 * after every property write, append and removal (and swallows a resolve
 * failure), and the chain is validated before a reference is ever written
 * (`elementWrites.ts`); a pre-existing broken chain elsewhere in the list must
 * not roll back an unrelated edit.
 */
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { AnimAddType } from "@renderer/types";
import { fail, ok } from "@renderer/worker/shared/result";
import {
  isFiniteMs,
  makeTimeValue,
  readAnimGraph,
  resolveSceneMgr,
  safeNum,
  safeStr,
  type AnimGraphRead,
} from "./resolve";
import { undoTxnResult } from "../withUndoTxn";
import { findByUid } from "./detail";
import { applyTiming } from "./elementWrites";
import { readMgrState } from "./read";
import type { TimeRefNode } from "./timeRefGraph";
import { goneFail, noMgrFail } from "./types";
import type {
  AnimAddElementArgs,
  AnimAddResult,
  AnimEditResult,
  AnimMoveElementArgs,
  AnimRemoveElementArgs,
  AnimSetElementTimeArgs,
} from "./types";
// --- detail shapes ---

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

/** Set an element's relative start/end (ms); C++ re-resolves on the write. */
export function setElementTime(
  ctx: WorkerContext,
  args: AnimSetElementTimeArgs,
): AnimEditResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return noMgrFail();
  const { scene, mgr } = sm;
  const found = findByUid(mgr, args.uid);
  if (!found) return goneFail();
  if (!isFiniteMs(args.startMs) || !isFiniteMs(args.endMs)) {
    return fail("start/end must be finite milliseconds", "invalid-args");
  }
  return undoTxnResult(scene, "Move animation element", () => {
    applyTiming(ctx, found.obj, { startMs: args.startMs, endMs: args.endMs });
    return ok();
  });
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

/**
 * The name a new element chains to: the element before the insertion point
 * (UXP parity), but only when a reference can legally bind to it -- it has a
 * name, that name is carried once, and its own timing resolves. Otherwise the
 * new element is absolute rather than born broken.
 */
function autoChainName(mgr: AnimMgr, read: AnimGraphRead, insertAt: number): string {
  const refIdx = insertAt - 1;
  if (refIdx < 0) return "";
  let ref: AnimObj | null = null;
  try {
    ref = mgr.getAt(refIdx) as AnimObj | null;
  } catch {
    ref = null;
  }
  if (!ref) return "";
  const node = read.graph.byUid.get(safeNum(() => ref.uid));
  if (!node || node.state !== "ok" || node.name === "" || read.graph.duplicateNames.has(node.name)) {
    return "";
  }
  return node.name;
}

/** Create a new element, auto-chained to the preceding one, and insert it. */
export function addElement(ctx: WorkerContext, args: AnimAddElementArgs): AnimAddResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return noMgrFail();
  const { scene, mgr } = sm;
  const className = classForAddType(args.type);
  ensureStartCam(scene, mgr, args.viewId);
  const read = readAnimGraph(mgr);
  const r = undoTxnResult(scene, "Add animation element", () => {
    const obj = ctx.svc.createObj(className) as AnimObj | null;
    if (!obj) return fail("createObj failed", "native");
    obj.name = uniqueElementName(mgr, className);

    const size = mgr.size;
    const insertAt =
      args.insertIndex !== undefined && args.insertIndex < size ? args.insertIndex : size;

    const chain = autoChainName(mgr, read, insertAt);
    if (chain !== "") obj.timeRefName = chain;

    const tvS = makeTimeValue(ctx, 0);
    const tvE = makeTimeValue(ctx, 1000);
    if (!tvS || !tvE) return fail("TimeValue create failed", "native");
    obj.start = tvS;
    obj.end = tvE;
    applyAddTypeDefaults(obj, args.type);

    if (insertAt < size) mgr.insertBefore(insertAt, obj);
    else mgr.append(obj);
    return ok({ uid: obj.uid, index: insertAt });
  });
  if (!r.ok) return { ...r, mgr: readMgrState(mgr) };
  return ok({ uid: r.uid, index: r.index, mgr: readMgrState(mgr) });
}

/**
 * Cut loose the elements whose start time chains to `target`.
 *
 * A relative start is an offset from another element's end, named by
 * `timeRefName`. Once that element is gone the name resolves to nothing and
 * C++ `resolveRelTime` throws for the whole manager -- so every later resolve
 * fails and playback is refused.
 *
 * A deleted reference cannot be re-pointed the way a renamed one is, so each
 * dependent is made absolute: at the position it currently occupies when its
 * chain resolves (the timeline looks unchanged), or keeping its offsets as
 * absolute times when it does not (there is no position to preserve). Only
 * the elements bound to the target count -- a name carried twice binds to its
 * first carrier, so deleting a later duplicate detaches nothing.
 */
function detachDependents(
  ctx: WorkerContext,
  read: AnimGraphRead,
  target: TimeRefNode | undefined,
): void {
  if (!target || target.name === "") return;
  if (read.graph.firstIndexByName.get(target.name) !== target.index) return;
  for (const n of read.graph.nodes) {
    if (n.uid === target.uid || n.timeRefName !== target.name) continue;
    const w = read.objs[n.index] as unknown as Record<string, unknown>;
    if (n.state === "ok") {
      const tvS = makeTimeValue(ctx, n.absStartMs as number);
      const tvE = makeTimeValue(ctx, n.absEndMs as number);
      if (!tvS || !tvE) throw new Error("TimeValue create failed");
      w.start = tvS;
      w.end = tvE;
    }
    w.timeRefName = "";
  }
}

/** Remove an element, cutting loose whatever chained to it. */
export function removeElement(
  ctx: WorkerContext,
  args: AnimRemoveElementArgs,
): AnimEditResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return noMgrFail();
  const { scene, mgr } = sm;
  const found = findByUid(mgr, args.uid);
  if (!found) return goneFail();
  const read = readAnimGraph(mgr);
  return undoTxnResult(scene, "Delete animation element", () => {
    detachDependents(ctx, read, read.graph.byUid.get(args.uid));
    if ((mgr.removeAt(found.index) as unknown) === false) return fail("removeAt failed", "native");
    return ok();
  });
}

/**
 * Reorder: remove the element, then re-insert at the raw `to` index (UXP
 * convention: removeAt(from) + insertBefore(to), append when to >= size).
 * The chain is untouched -- resolution is by name and order-independent.
 */
export function moveElement(
  ctx: WorkerContext,
  args: AnimMoveElementArgs,
): AnimEditResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return noMgrFail();
  const { scene, mgr } = sm;
  const found = findByUid(mgr, args.uid);
  if (!found) return goneFail();
  const from = found.index;
  const size = safeNum(() => mgr.size);
  const to = Math.max(0, Math.min(size - 1, args.to));
  if (to === from) return ok();
  return undoTxnResult(scene, "Reorder animation element", () => {
    mgr.removeAt(from);
    if (to < mgr.size) mgr.insertBefore(to, found.obj);
    else mgr.append(found.obj);
    return ok();
  });
}
