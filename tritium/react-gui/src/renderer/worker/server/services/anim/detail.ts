/**
 * @file worker/server/services/anim/detail.ts
 * @description One element, as the inspector shows it.
 *
 * Elements are addressed by a stable uid rather than an index, because the
 * strip can be reordered underneath an open inspector. Time can be stated
 * relative to another element by name; the name and time-reference writes
 * are validated against the whole chain before they land (`elementWrites.ts`
 * over `timeRefGraph.ts`), so a write that would dangle, loop or collide is
 * refused with a reason instead of leaving the manager unresolvable, and a
 * rename carries the elements chained to the old name along with it.
 */
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import { fail, failFrom, ok } from "@renderer/worker/shared/result";
import { classNameToType } from "./elementType";
import {
  safeNum,
  safeBool,
  safeStr,
  resolveMgr,
  resolveSceneMgr,
  forEachAnimObj,
  readAnimGraph,
} from "./resolve";
import { undoTxnResult } from "../withUndoTxn";
import { checkTimeRef, type TimeRefGraph } from "./timeRefGraph";
import { applyTiming, isTiming, planNameWrite, planTimeRefWrite } from "./elementWrites";
import type { AnimElementType } from "@renderer/types";
import { goneFail, noMgrFail } from "./types";
import type {
  AnimTimingMs,
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

/**
 * The Relative-to candidates: every other distinct, non-empty name, each
 * judged by `checkTimeRef` so the dropdown can disable the ones that would
 * close a cycle, are ambiguous, or do not resolve.
 */
function readSiblings(graph: TimeRefGraph, uid: number): AnimElementSibling[] {
  const out: AnimElementSibling[] = [];
  const seen = new Set<string>();
  for (const n of graph.nodes) {
    if (n.uid === uid || n.name === "" || seen.has(n.name)) continue;
    seen.add(n.name);
    const check = checkTimeRef(graph, uid, n.name);
    out.push(check.ok ? { name: n.name, usable: true } : { name: n.name, usable: false, reason: check.error });
  }
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
  const { graph } = readAnimGraph(mgr);
  return { common, typeProps: readTypeProps(obj, type), siblings: readSiblings(graph, uid) };
}

/**
 * Apply a plain prop write to the wrapped AnimObj (coercing by prop type).
 * `name`, `timeRefName` and `timing` are not plain: they go through
 * `elementWrites.ts` and are handled by `setAnimElementProp` itself.
 */
function applyProp(
  ctx: WorkerContext,
  obj: AnimObj,
  prop: AnimElementPropKey,
  value: SetAnimElementPropArgs["value"],
): void {
  const w = obj as unknown as Record<string, unknown>;
  switch (prop) {
    case "disabled":
      w.disabled = Boolean(value);
      break;
    case "quadric":
      w.quadric = Number(value);
      break;
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
      throw new Error(`unsupported property: ${String(prop)}`);
  }
}

// --- services ---

/** Read the full detail for a selected element (resolved by stable uid). */
export function getAnimElementDetail(
  ctx: WorkerContext,
  args: GetAnimElementDetailArgs,
): GetAnimElementDetailResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return noMgrFail();
  const detail = buildDetail(mgr, args.uid);
  if (!detail) return goneFail();
  return ok({ detail });
}

function sameTiming(a: AnimTimingMs, b: AnimTimingMs): boolean {
  return a.startMs === b.startMs && a.endMs === b.endMs;
}

const BAD_TIMING = "start/end must be finite milliseconds";

/**
 * Write one property of the element and return the refreshed detail.
 *
 * Nothing is written and no undo transaction is opened until the write is
 * known to be legal: the uid is resolved first (a vanished element used to
 * commit an empty transaction and lose redo), and `name` / `timeRefName` are
 * validated against the whole chain (`planNameWrite` / `planTimeRefWrite`).
 * A refused write comes back as a `Fail` with the reason; `gone` marks the
 * one failure the inspector closes on.
 *
 * `timing` also takes the realtime drag protocol (`args.mode`, see
 * `SetAnimElementPropArgs`): a `preview` writes without a transaction -- the
 * change still reaches the timeline through the prop-change event, which
 * `AnimMgr::propChanged` fires whether or not a transaction is open -- and
 * returns no detail; an `abort` restores `original` without one; a `commit`
 * carrying `original` restores it outside the transaction and writes `value`
 * inside it, so undo goes back to where the drag began. When `original`
 * equals `value` only the restore happens: an empty transaction would still
 * clear the redo stack.
 */
export function setAnimElementProp(
  ctx: WorkerContext,
  args: SetAnimElementPropArgs,
): SetAnimElementPropResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return noMgrFail();
  const { scene, mgr } = sm;
  const found = findByUid(mgr, args.uid);
  if (!found) return goneFail();
  const mode = args.mode ?? "commit";
  const finish = (): SetAnimElementPropResult => {
    const detail = buildDetail(mgr, args.uid);
    return detail ? ok({ detail }) : goneFail();
  };

  if (args.prop === "timing") {
    const value = args.value;
    if (!isTiming(value)) return fail(BAD_TIMING, "invalid-args");
    if (mode !== "commit") {
      const target = mode === "preview" ? value : args.original;
      if (!isTiming(target)) return fail(BAD_TIMING, "invalid-args");
      try {
        applyTiming(ctx, found.obj, target);
      } catch (e) {
        return failFrom(e, "native");
      }
      return mode === "preview" ? ok({}) : finish();
    }
    let record = true;
    if (args.original !== undefined) {
      if (!isTiming(args.original)) return fail(BAD_TIMING, "invalid-args");
      try {
        applyTiming(ctx, found.obj, args.original);
      } catch (e) {
        return failFrom(e, "native");
      }
      record = !sameTiming(args.original, value);
    }
    if (record) {
      const r = undoTxnResult(scene, "Change animation: timing", () => {
        applyTiming(ctx, found.obj, value);
        return ok();
      });
      if (!r.ok) return r;
    }
    return finish();
  }

  if (mode !== "commit") return fail("only timing supports preview/abort", "unsupported");

  if (args.prop === "timeRefName" || args.prop === "name") {
    const { graph, objs } = readAnimGraph(mgr);
    const plan =
      args.prop === "timeRefName"
        ? planTimeRefWrite(ctx, graph, found.obj, args.uid, args.value)
        : planNameWrite(graph, objs, found.obj, args.uid, args.value);
    if (!plan.ok) return plan;
    if (plan.noop) return finish();
    const r = undoTxnResult(scene, `Change animation: ${args.prop}`, () => {
      plan.apply();
      return ok();
    });
    if (!r.ok) return r;
    return finish();
  }

  const r = undoTxnResult(scene, `Change animation: ${args.prop}`, () => {
    applyProp(ctx, found.obj, args.prop, args.value);
    return ok();
  });
  if (!r.ok) return r;
  return finish();
}
