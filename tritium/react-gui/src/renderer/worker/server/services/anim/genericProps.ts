/**
 * @file worker/server/services/anim/genericProps.ts
 * @description The raw property tab for one animation element.
 *
 * Mirrors what genericProps.service does for scene nodes, against an AnimObj:
 * the inspector's Generic tab is the same table either side.
 */
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import { resolveMgr, resolveSceneMgr } from "./resolve";
import { withUndoTxn } from "../withUndoTxn";
import { findByUid } from "./detail";
import type {
  AnimGenericPropsResult,
  GetAnimElementGenericPropsArgs,
  ResetAnimElementGenericPropsArgs,
  SetAnimElementGenericPropArgs,
} from "./types";
import { parseGenericProps, type GenericPropEntry } from "@renderer/worker/server/services/helpers/parseGenericProps";
import type { BaseWrapper } from "@cuemol/core/src/BaseWrapper";
// --- detail shapes ---

/** Read + parse the AnimObj's full property list (generic tab). */
function readAnimGenericEntries(obj: AnimObj): GenericPropEntry[] {
  try {
    return parseGenericProps(JSON.parse((obj as unknown as BaseWrapper).getPropsJSON()));
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
  if (!mgr) return { ok: false, entries: [] };
  const found = findByUid(mgr, args.uid);
  if (!found) return { ok: false, gone: true, entries: [] };
  return { ok: true, entries: readAnimGenericEntries(found.obj) };
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
  const fail: AnimGenericPropsResult = { ok: false, entries: [] };
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return fail;
  const { scene, mgr } = sm;
  const found = findByUid(mgr, args.uid);
  if (!found) return { ok: false, gone: true, entries: [] };
  const obj = found.obj as unknown as BaseWrapper;
  const mode = args.mode ?? "commit";

  if (mode !== "commit") {
    if (args.op !== "set") return fail;
    try {
      if (mode === "preview") obj.setProp(args.propName, args.value);
      else if (args.originalWasDefault) obj.resetProp(args.propName);
      else obj.setProp(args.propName, args.value);
    } catch (e) {
      console.warn(`setAnimElementGenericProp (${mode}) failed:`, e);
      return fail;
    }
    return { ok: true, entries: [] };
  }

  const label =
    args.op === "reset"
      ? `Reset property: ${args.propName}`
      : `Change property: ${args.propName}`;
  try {
    if (args.op === "set" && args.originalValue !== undefined) {
      if (args.originalWasDefault) obj.resetProp(args.propName);
      else obj.setProp(args.propName, args.originalValue);
    }
    withUndoTxn(scene, label, () => {
      if (args.op === "reset") obj.resetProp(args.propName);
      else obj.setProp(args.propName, args.value);
    });
  } catch (e) {
    console.warn("setAnimElementGenericProp failed:", e);
    return fail;
  }
  return { ok: true, entries: readAnimGenericEntries(found.obj) };
}

/** Reset several generic properties to their C++ defaults in one undo step. */
export function resetAnimElementGenericProps(
  ctx: WorkerContext,
  args: ResetAnimElementGenericPropsArgs,
): AnimGenericPropsResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm || args.propNames.length === 0) return { ok: false, entries: [] };
  const { scene, mgr } = sm;
  let gone = false;
  const label =
    args.propNames.length === 1
      ? `Reset property: ${args.propNames[0]}`
      : `Reset ${args.propNames.length} properties`;
  try {
    withUndoTxn(scene, label, () => {
      const found = findByUid(mgr, args.uid);
      if (!found) {
        gone = true;
        return;
      }
      const obj = found.obj as unknown as BaseWrapper;
      for (const name of args.propNames) obj.resetProp(name);
    });
  } catch (e) {
    console.warn("resetAnimElementGenericProps failed:", e);
    return { ok: false, entries: [] };
  }
  if (gone) return { ok: false, gone: true, entries: [] };
  const found = findByUid(mgr, args.uid);
  return { ok: true, entries: found ? readAnimGenericEntries(found.obj) : [] };
}
