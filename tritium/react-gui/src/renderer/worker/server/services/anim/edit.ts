/**
 * @file worker/server/services/anim/edit.ts
 * @description Changing the strip: add, remove, reorder, retime.
 *
 * Every one of these is a scene edit, so it goes through an undo transaction
 * and the panel refetches the timeline afterwards.
 */
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { AnimAddType } from "@renderer/types";
import {
  forEachAnimObj,
  makeTimeValue,
  resolveSceneMgr,
  safeNum,
  safeStr,
} from "./resolve";
import { withUndoTxn } from "../withUndoTxn";
import { readMgrState } from "./read";
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

/** Set an element's relative start/end (ms) and re-resolve absolute times. */
export function setElementTime(
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
export function addElement(ctx: WorkerContext, args: AnimAddElementArgs): AnimAddResult {
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
/**
 * Cut loose the elements whose start time chains to the one at `index`.
 *
 * A relative start is an offset from another element's end, named by
 * `timeRefName`. Once that element is gone the name resolves to nothing, and
 * C++ `resolveRelTime` throws for the whole manager -- so every later resolve
 * fails, the strip keeps whatever absolute times it was last drawn with, and
 * no further edit to any element can land.
 *
 * A deleted reference cannot be re-pointed the way a renamed one is
 * (`cascadeTimeRefRename`), so each dependent is made absolute at the position
 * it currently occupies: the timeline looks unchanged, and the chain is gone
 * rather than dangling.
 */
function detachDependents(ctx: WorkerContext, mgr: AnimMgr, index: number): void {
  const target = mgr.getAt(index) as AnimObj | null;
  if (!target) return;
  const name = safeStr(() => target.name);
  if (!name) return;
  // Absolute times have to be current before they are copied. A resolve that
  // already fails leaves nothing worth preserving, so the offsets stand.
  try {
    mgr.resolveRelTime();
  } catch {
    /* already dangling elsewhere */
  }
  forEachAnimObj(mgr, (obj) => {
    if (safeStr(() => obj.timeRefName) !== name) return undefined;
    const tvS = makeTimeValue(ctx, safeNum(() => obj.absStart.millisec) ?? 0);
    const tvE = makeTimeValue(ctx, safeNum(() => obj.absEnd.millisec) ?? 0);
    if (tvS && tvE) {
      obj.start = tvS;
      obj.end = tvE;
    }
    (obj as unknown as Record<string, unknown>).timeRefName = "";
    return undefined;
  });
}

export function removeElement(
  ctx: WorkerContext,
  args: AnimRemoveElementArgs,
): AnimEditResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return { ok: false };
  const { scene, mgr } = sm;
  try {
    withUndoTxn(scene, "Delete animation element", () => {
      detachDependents(ctx, mgr, args.index);
      mgr.removeAt(args.index);
      mgr.resolveRelTime();
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
export function moveElement(
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
