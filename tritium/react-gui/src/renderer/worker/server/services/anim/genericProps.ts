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

/** Write or reset one generic property (undoable); returns the fresh list. */
export function setAnimElementGenericProp(
  ctx: WorkerContext,
  args: SetAnimElementGenericPropArgs,
): AnimGenericPropsResult {
  const sm = resolveSceneMgr(ctx, args.sceneId);
  if (!sm) return { ok: false, entries: [] };
  const { scene, mgr } = sm;
  let gone = false;
  const label =
    args.op === "reset"
      ? `Reset property: ${args.propName}`
      : `Change property: ${args.propName}`;
  try {
    withUndoTxn(scene, label, () => {
      const found = findByUid(mgr, args.uid);
      if (!found) {
        gone = true;
        return;
      }
      const obj = found.obj as unknown as BaseWrapper;
      if (args.op === "reset") obj.resetProp(args.propName);
      else obj.setProp(args.propName, args.value);
    });
  } catch (e) {
    console.warn("setAnimElementGenericProp failed:", e);
    return { ok: false, entries: [] };
  }
  if (gone) return { ok: false, gone: true, entries: [] };
  const found = findByUid(mgr, args.uid);
  return { ok: true, entries: found ? readAnimGenericEntries(found.obj) : [] };
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
