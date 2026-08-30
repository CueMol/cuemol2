/**
 * @file worker/server/services/anim/detail.ts
 * @description One element, as the inspector shows it.
 *
 * Elements are addressed by a stable uid rather than an index, because the
 * strip can be reordered underneath an open inspector. Time can be stated
 * relative to another element by name, which is why writing a name has to
 * cascade into whoever referred to the old one.
 */
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import { classNameToType } from "./elementType";
import {
  safeNum,
  safeBool,
  safeStr,
  resolveMgr,
  resolveSceneMgr,
  makeTimeValue,
  forEachAnimObj,
} from "./resolve";
import { withUndoTxn } from "../withUndoTxn";
import type { AnimElementType } from "@renderer/types";
import type {
  AnimElementCommon,
  AnimElementDetail,
  AnimElementPropKey,
  AnimElementSibling,
  AnimElementTypeProps,
  GetAnimElementDetailArgs,
  GetAnimElementDetailResult,
  SetAnimElementPropArgs,
  SetAnimElementPropResult,
} from "./types";
// --- detail shapes ---

/**
 * Resolve a stable uid to its current AnimObj + volatile index by scanning the
 * manager's list. The ONLY liveness-correct accessor (see file header).
 */
export function findByUid(mgr: AnimMgr, uid: number): { obj: AnimObj; index: number } | null {
  return (
    forEachAnimObj(mgr, (obj, i) =>
      safeNum(() => obj.uid) === uid ? { obj, index: i } : undefined,
    ) ?? null
  );
}

/** Resolve relative->absolute, swallowing a cyclic/missing-ref throw so a bad
 *  sibling reference cannot roll back an unrelated field edit. */
function tryResolveRel(mgr: AnimMgr): void {
  try {
    mgr.resolveRelTime();
  } catch {
    /* bad sibling ref must not abort the edit */
  }
}

/**
 * Hold a re-based span at or after its base, keeping its duration.
 *
 * A relative start is an offset from the reference's END, so a negative one
 * would mean "starts before the element it chains after finishes" -- a state
 * the timeline was never designed for (it resolves to an absolute time that can
 * fall before zero). Rather than let a conversion produce one, the element is
 * pulled to the reference's end and keeps its length.
 */
function clampRelSpan(start: number, end: number): { start: number; end: number } {
  if (start >= 0) return { start, end };
  return { start: 0, end: Math.max(0, end - start) };
}

/**
 * Absolute end (ms) of the sibling named `name` -- the base a relative time is
 * measured from -- or null when no element carries that name.
 */
function refAbsEndMs(mgr: AnimMgr, name: string): number | null {
  const ref = forEachAnimObj(mgr, (obj) =>
    safeStr(() => obj.name) === name ? obj : undefined,
  );
  return ref ? safeNum(() => ref.absEnd.millisec) : null;
}

/** Read the subtype-specific props for the element's type. */
function readTypeProps(obj: AnimObj, type: AnimElementType): AnimElementTypeProps {
  const w = obj as unknown as Record<string, unknown>;
  const tp: AnimElementTypeProps = {};
  switch (type) {
    case "SimpleSpin": {
      tp.angle = safeNum(() => w.angle as number);
      let ax: Record<string, unknown> | null = null;
      try {
        ax = w.axis as Record<string, unknown>;
      } catch {
        ax = null;
      }
      tp.axisX = safeNum(() => ax?.x as number);
      tp.axisY = safeNum(() => ax?.y as number);
      tp.axisZ = safeNum(() => ax?.z as number);
      break;
    }
    case "CamMotion":
      tp.endcam = safeStr(() => w.endcam as string);
      tp.ignorerotate = safeBool(() => w.ignorerotate as boolean);
      tp.ignorecenter = safeBool(() => w.ignorecenter as boolean);
      tp.ignorezoom = safeBool(() => w.ignorezoom as boolean);
      tp.ignoreslab = safeBool(() => w.ignoreslab as boolean);
      break;
    case "ShowHideAnim":
      tp.rend = safeStr(() => w.rend as string);
      tp.hide = safeBool(() => w.hide as boolean);
      tp.fade = safeBool(() => w.fade as boolean);
      tp.tgtAlpha = safeNum(() => w.tgt_alpha as number);
      break;
    case "SlideInOutAnim":
      tp.rend = safeStr(() => w.rend as string);
      tp.hide = safeBool(() => w.hide as boolean);
      tp.direction = safeNum(() => w.direction as number);
      tp.distance = safeNum(() => w.distance as number);
      break;
    case "MolAnim":
      tp.mol = safeStr(() => w.mol as string);
      tp.startValue = safeNum(() => w.startValue as number);
      tp.endValue = safeNum(() => w.endValue as number);
      break;
    default:
      break; // Noop / unknown: no type props
  }
  return tp;
}

/** Collect other elements' names for the Relative-to dropdown. */
function readSiblings(mgr: AnimMgr, uid: number): AnimElementSibling[] {
  const out: AnimElementSibling[] = [];
  forEachAnimObj(mgr, (obj) => {
    if (safeNum(() => obj.uid) === uid) return undefined;
    out.push({ name: safeStr(() => obj.name) });
    return undefined;
  });
  return out;
}

/** Build the full detail for a uid, or null when the element is gone. */
export function buildDetail(mgr: AnimMgr, uid: number): AnimElementDetail | null {
  const found = findByUid(mgr, uid);
  if (!found) return null;
  const obj = found.obj;
  const type = classNameToType(obj);
  const common: AnimElementCommon = {
    uid: safeNum(() => obj.uid),
    name: safeStr(() => obj.name),
    type,
    disabled: safeBool(() => obj.disabled),
    timeRefName: safeStr(() => obj.timeRefName),
    startMs: safeNum(() => obj.start.millisec),
    endMs: safeNum(() => obj.end.millisec),
    quadric: safeNum(() => obj.quadric),
  };
  return { common, typeProps: readTypeProps(obj, type), siblings: readSiblings(mgr, uid) };
}

/** Apply a single prop write to the wrapped AnimObj (coercing by prop type). */
function applyProp(
  ctx: WorkerContext,
  mgr: AnimMgr,
  obj: AnimObj,
  prop: AnimElementPropKey,
  value: SetAnimElementPropArgs["value"],
): void {
  const w = obj as unknown as Record<string, unknown>;
  switch (prop) {
    case "name":
      w.name = String(value);
      break;
    case "disabled":
      w.disabled = Boolean(value);
      break;
    case "quadric":
      w.quadric = Number(value);
      break;
    case "timeRefName": {
      // Re-base the stored relative times so the element keeps its place on the
      // timeline. C++ resolves `abs = base + rel`, where `base` is 0 when the
      // element is absolute and the reference's absEnd otherwise
      // (`AnimMgr::resolveTimeImpl`), so writing the name alone reinterprets the
      // SAME rel against a different base and teleports the element.
      //
      // A negative relative time is not a supported state (see `clampRelSpan`);
      // when the element sat before the new reference's end, it is pulled to
      // that end -- position is preserved only where it can be.
      const nextRef = String(value);
      tryResolveRel(mgr); // read the current abs position, not a stale one
      const absStart = safeNum(() => obj.absStart.millisec);
      const absEnd = safeNum(() => obj.absEnd.millisec);
      // Read the new base BEFORE the write: the reference's own position does
      // not depend on this element (a chain back to it would be a cycle, which
      // `resolveRelTime` rejects and `tryResolveRel` swallows).
      const base = nextRef === "" ? 0 : refAbsEndMs(mgr, nextRef);
      w.timeRefName = nextRef;
      if (base !== null) {
        const span = clampRelSpan(absStart - base, absEnd - base);
        const tvS = makeTimeValue(ctx, span.start);
        const tvE = makeTimeValue(ctx, span.end);
        if (tvS && tvE) {
          w.start = tvS;
          w.end = tvE;
        }
      }
      tryResolveRel(mgr);
      break;
    }
    case "timing": {
      const v = value as { startMs: number; endMs: number };
      const tvS = makeTimeValue(ctx, Math.min(v.startMs, v.endMs));
      const tvE = makeTimeValue(ctx, Math.max(v.startMs, v.endMs));
      if (!tvS || !tvE) throw new Error("TimeValue create failed");
      w.start = tvS;
      w.end = tvE;
      tryResolveRel(mgr);
      break;
    }
    case "axis": {
      const v = value as { x: number; y: number; z: number };
      const vec = ctx.svc.createObj("Vector") as unknown as Record<string, unknown> | null;
      if (!vec) throw new Error("Vector create failed");
      vec.x = v.x;
      vec.y = v.y;
      vec.z = v.z;
      w.axis = vec; // C++ normalizes; near-zero keeps the old value
      break;
    }
    case "angle":
    case "direction":
    case "distance":
    case "startValue":
    case "endValue":
      w[prop] = Number(value);
      break;
    case "tgtAlpha":
      w.tgt_alpha = Number(value); // camel -> C++ snake key
      break;
    case "endcam":
    case "rend":
    case "mol":
      w[prop] = String(value);
      break;
    case "ignorerotate":
    case "ignorecenter":
    case "ignorezoom":
    case "ignoreslab":
    case "hide":
    case "fade":
      w[prop] = Boolean(value); // never raw assign: Boolean("false") === true
      break;
    default:
      break;
  }
}

// --- services ---

/** Read the full detail for a selected element (resolved by stable uid). */
export function getAnimElementDetail(
  ctx: WorkerContext,
  args: GetAnimElementDetailArgs,
): GetAnimElementDetailResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return { ok: false };
  const detail = buildDetail(mgr, args.uid);
  if (!detail) return { ok: false, gone: true };
  return { ok: true, detail };
}

/**
 * After an element is renamed, retarget every sibling that referenced the old
 * name via `timeRefName` so the relative-time chain is not orphaned (UXP parity).
 * Runs inside the rename's undo txn so undo reverts the rename + the retargets
 * together.
 */
function cascadeTimeRefRename(mgr: AnimMgr, uid: number, oldName: string, newName: string): void {
  forEachAnimObj(mgr, (obj) => {
    if (safeNum(() => obj.uid) === uid) return undefined; // skip the renamed element itself
    if (safeStr(() => obj.timeRefName) === oldName) {
      try {
        (obj as unknown as Record<string, unknown>).timeRefName = newName;
      } catch {
        /* ignore a sibling that rejects the write */
      }
    }
    return undefined;
  });
}

/** Write one property of the element (undoable; returns the refreshed detail). */
export function setAnimElementProp(
  ctx: WorkerContext,
  args: SetAnimElementPropArgs,
): SetAnimElementPropResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return { ok: false };
  const { scene, mgr } = sm;
  let gone = false;
  try {
    withUndoTxn(scene, `Change animation: ${args.prop}`, () => {
      const found = findByUid(mgr, args.uid);
      if (!found) {
        gone = true;
        return;
      }
      // Capture the old name before writing so a rename can cascade to the
      // siblings that reference it by timeRefName.
      const oldName = args.prop === "name" ? safeStr(() => found.obj.name) : "";
      applyProp(ctx, mgr, found.obj, args.prop, args.value);
      if (args.prop === "name") {
        const newName = String(args.value);
        if (oldName && newName !== oldName) {
          cascadeTimeRefRename(mgr, args.uid, oldName, newName);
          tryResolveRel(mgr);
        }
      }
    });
  } catch {
    return { ok: false };
  }
  if (gone) return { ok: false, gone: true };
  const detail = buildDetail(mgr, args.uid);
  if (!detail) return { ok: false, gone: true };
  return { ok: true, detail };
}
