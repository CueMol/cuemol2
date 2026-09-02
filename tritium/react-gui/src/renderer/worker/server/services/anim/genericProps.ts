/**
 * @file worker/server/services/anim/genericProps.ts
 * @description The raw property tab for one animation element.
 *
 * Mirrors what genericProps.service does for scene nodes, against an AnimObj:
 * the inspector's Generic tab is the same table either side. Two rows are
 * not raw here. `name` and `timeRefName` are the chain -- written through the
 * same validated plans as the structured tab, so the Generic tab cannot
 * dangle, loop or duplicate a reference. `start` and `end` are reported
 * read-only: they are one span, edited as Start / Duration on the Properties
 * tab, and writing one of them alone makes C++ collapse the other onto it.
 */
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import { fail, failFrom, ok } from "@renderer/worker/shared/result";
import { readAnimGraph, resolveMgr, resolveSceneMgr } from "./resolve";
import { undoTxnResult } from "../withUndoTxn";
import { findByUid } from "./detail";
import { planNameWrite, planTimeRefWrite } from "./elementWrites";
import { goneFail, noMgrFail } from "./types";
import type {
  AnimGenericPropsResult,
  GetAnimElementGenericPropsArgs,
  ResetAnimElementGenericPropsArgs,
  SetAnimElementGenericPropArgs,
} from "./types";
import { parseGenericProps, type GenericPropEntry } from "@renderer/worker/server/services/helpers/parseGenericProps";
import type { BaseWrapper } from "@cuemol/core/src/BaseWrapper";
// --- detail shapes ---

/** Rows written through the validated chain plans, not raw `setProp`. */
const GUARDED = new Set(["name", "timeRefName"]);
/** Rows the Generic tab shows but does not write (one span, two fields). */
const TIMING_ROWS = new Set(["start", "end"]);

/** Read + parse the AnimObj's full property list (generic tab). */
function readAnimGenericEntries(obj: AnimObj): GenericPropEntry[] {
  try {
    const entries = parseGenericProps(JSON.parse((obj as unknown as BaseWrapper).getPropsJSON()));
    return entries.map((e) => (TIMING_ROWS.has(e.key) ? { ...e, readonly: true } : e));
  } catch {
    return [];
  }
}

/** Dump every property of the element (resolved by stable uid). */
export function getAnimElementGenericProps(
  ctx: WorkerContext,
  args: GetAnimElementGenericPropsArgs,
): AnimGenericPropsResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return noMgrFail();
  const found = findByUid(mgr, args.uid);
  if (!found) return goneFail();
  return ok({ entries: readAnimGenericEntries(found.obj) });
}

/**
 * Write or reset one generic property and return the fresh list.
 *
 * A plain write is one undo transaction. A `set` also takes the realtime drag
 * protocol of `setGenericProp` (`args.mode`): a `preview` writes without a
 * transaction and returns no entries (the parent drives the field from its
 * own draft), an `abort` restores the pre-drag value carried in `value` -- or
 * the default flag, when `originalWasDefault` -- without one, and a `commit`
 * carrying `originalValue` restores that first, outside the transaction, so
 * the single recorded step spans the whole drag and undo reverts the default
 * state too. The uid is resolved before any transaction opens: a vanished
 * element must not commit an empty transaction, which clears redo.
 */
export function setAnimElementGenericProp(
  ctx: WorkerContext,
  args: SetAnimElementGenericPropArgs,
): AnimGenericPropsResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return noMgrFail();
  const { scene, mgr } = sm;
  const found = findByUid(mgr, args.uid);
  if (!found) return goneFail();
  const obj = found.obj as unknown as BaseWrapper;
  const mode = args.mode ?? "commit";
  const key = args.propName;

  if (GUARDED.has(key)) {
    if (args.op !== "set") return fail(`"${key}" has no default`, "unsupported");
    if (mode !== "commit") return fail(`"${key}" does not support realtime preview`, "unsupported");
    const { graph, objs } = readAnimGraph(mgr);
    const plan =
      key === "timeRefName"
        ? planTimeRefWrite(ctx, graph, found.obj, args.uid, args.value)
        : planNameWrite(graph, objs, found.obj, args.uid, args.value);
    if (!plan.ok) return plan;
    if (!plan.noop) {
      const r = undoTxnResult(scene, `Change property: ${key}`, () => {
        plan.apply();
        return ok();
      });
      if (!r.ok) return r;
    }
    return ok({ entries: readAnimGenericEntries(found.obj) });
  }
  if (TIMING_ROWS.has(key)) {
    return fail(`"${key}" is edited as Start / Duration on the Properties tab`, "unsupported");
  }

  if (mode !== "commit") {
    if (args.op !== "set") return fail("a reset never previews", "unsupported");
    try {
      if (mode === "preview") obj.setProp(key, args.value);
      else if (args.originalWasDefault) obj.resetProp(key);
      else obj.setProp(key, args.value);
    } catch (e) {
      console.warn(`setAnimElementGenericProp (${mode}) failed:`, e);
      return failFrom(e, "native");
    }
    return ok({ entries: [] });
  }

  // A commit after a realtime drag: put the object back where the drag began
  // (outside the transaction) so the recorded step is original -> value
  // rather than last preview -> value.
  if (args.op === "set" && args.originalValue !== undefined) {
    try {
      if (args.originalWasDefault) obj.resetProp(key);
      else obj.setProp(key, args.originalValue);
    } catch (e) {
      console.warn("setAnimElementGenericProp (restore) failed:", e);
      return failFrom(e, "native");
    }
  }
  const label = args.op === "reset" ? `Reset property: ${key}` : `Change property: ${key}`;
  const r = undoTxnResult(scene, label, () => {
    if (args.op === "reset") obj.resetProp(key);
    else obj.setProp(key, args.value);
    return ok();
  });
  if (!r.ok) {
    console.warn("setAnimElementGenericProp failed:", r.error);
    return r;
  }
  return ok({ entries: readAnimGenericEntries(found.obj) });
}

/** Reset several generic properties to their C++ defaults in one undo step. */
export function resetAnimElementGenericProps(
  ctx: WorkerContext,
  args: ResetAnimElementGenericPropsArgs,
): AnimGenericPropsResult {
  if (args.propNames.length === 0) return fail("no properties to reset", "invalid-args");
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return noMgrFail();
  const { scene, mgr } = sm;
  const found = findByUid(mgr, args.uid);
  if (!found) return goneFail();
  const obj = found.obj as unknown as BaseWrapper;
  const label =
    args.propNames.length === 1
      ? `Reset property: ${args.propNames[0]}`
      : `Reset ${args.propNames.length} properties`;
  const r = undoTxnResult(scene, label, () => {
    for (const name of args.propNames) obj.resetProp(name);
    return ok();
  });
  if (!r.ok) {
    console.warn("resetAnimElementGenericProps failed:", r.error);
    return r;
  }
  return ok({ entries: readAnimGenericEntries(found.obj) });
}
