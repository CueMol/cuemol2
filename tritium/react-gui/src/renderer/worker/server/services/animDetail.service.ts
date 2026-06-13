/**
 * @file services/animDetail.service.ts
 * @description Per-element detail read/write for the animation detail inspector
 * (right InspectorPanel, anim-element target).
 *
 * `AnimObj` is owned by `AnimMgr`, not by the scene object table, so the generic
 * property bridge (`genericProps.service`) cannot target it. These services
 * mirror that shape with a dedicated path:
 *   - getAnimElementDetail  -- common + per-type props + sibling names (read)
 *   - setAnimElementProp    -- write one prop (withUndoTxn; timing/axis special)
 *   - getAnimTargetOptions  -- renderer / camera / mol names for the dropdowns
 *
 * Elements are resolved by STABLE `uid` via a linear scan of the manager's
 * current list (`findByUid`): `AnimMgr` exposes no getByUID, and resolving via
 * the global `ObjectManager` would return removed-but-undoable elements (the
 * undo record keeps them alive/registered), breaking the "gone" signal. A scan
 * of `m_data` is the only liveness-correct accessor (element count is small).
 */

import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { WorkerContext } from "../types/WorkerContext";
import type { AnimElementType } from "../../../types";
import { getSceneOrNull } from "./helpers/sceneResolver";
import {
  safeNum,
  safeBool,
  safeStr,
  resolveMgr,
  resolveSceneMgr,
  makeTimeValue,
} from "./helpers/animResolve";
import { classNameToType } from "./helpers/animElementType";
import { withUndoTxn } from "./withUndoTxn";
import { parseSceneTreeJSON, type SceneTreeNode } from "../../shared/sceneTreeTypes";

// --- detail shapes ---

/** Common fields shared by every element (volatile index is intentionally omitted). */
export interface AnimElementCommon {
  uid: number;
  name: string;
  type: AnimElementType;
  disabled: boolean;
  timeRefName: string; // '' = (absolute)
  startMs: number; // RELATIVE
  endMs: number; // RELATIVE
  quadric: number; // raw real (renderer maps to/from 0..50%)
}

/** Only the inspected subtype's props are populated; the rest are undefined. */
export interface AnimElementTypeProps {
  angle?: number;
  axisX?: number;
  axisY?: number;
  axisZ?: number; // SimpleSpin
  endcam?: string;
  ignorerotate?: boolean;
  ignorecenter?: boolean;
  ignorezoom?: boolean;
  ignoreslab?: boolean; // CamMotion
  rend?: string; // ShowHideAnim / SlideInOutAnim
  hide?: boolean;
  fade?: boolean;
  tgtAlpha?: number; // ShowHideAnim
  direction?: number;
  distance?: number; // SlideInOutAnim
  mol?: string;
  startValue?: number;
  endValue?: number; // MolAnim
}

/** Other element's name, for the Relative-to dropdown. */
export interface AnimElementSibling {
  name: string;
}

export interface AnimElementDetail {
  common: AnimElementCommon;
  typeProps: AnimElementTypeProps;
  siblings: AnimElementSibling[];
}

export interface GetAnimElementDetailArgs {
  sceneId: number;
  uid: number;
}

export interface GetAnimElementDetailResult {
  ok: boolean;
  /** true = uid no longer in the manager (deleted). The inspector clears on this. */
  gone?: boolean;
  detail?: AnimElementDetail;
}

/** Prop keys the inspector can write. `timing` and `axis` carry object values. */
export type AnimElementPropKey =
  | "name"
  | "disabled"
  | "quadric"
  | "timeRefName"
  | "timing"
  | "angle"
  | "axis"
  | "endcam"
  | "ignorerotate"
  | "ignorecenter"
  | "ignorezoom"
  | "ignoreslab"
  | "rend"
  | "hide"
  | "fade"
  | "tgtAlpha"
  | "direction"
  | "distance"
  | "mol"
  | "startValue"
  | "endValue";

export interface SetAnimElementPropArgs {
  sceneId: number;
  uid: number;
  prop: AnimElementPropKey;
  value:
    | string
    | number
    | boolean
    | { startMs: number; endMs: number } // prop === "timing"
    | { x: number; y: number; z: number }; // prop === "axis"
}

export interface SetAnimElementPropResult {
  ok: boolean;
  gone?: boolean;
  detail?: AnimElementDetail;
}

export interface GetAnimTargetOptionsArgs {
  sceneId: number;
}

export interface AnimRendererOption {
  name: string;
  objName: string;
  type: string;
}
export interface AnimCameraOption {
  name: string;
}
export interface AnimMolOption {
  name: string;
}

export interface GetAnimTargetOptionsResult {
  ok: boolean;
  renderers: AnimRendererOption[];
  cameras: AnimCameraOption[];
  mols: AnimMolOption[];
}

// --- helpers ---

/**
 * Resolve a stable uid to its current AnimObj + volatile index by scanning the
 * manager's list. The ONLY liveness-correct accessor (see file header).
 */
function findByUid(mgr: AnimMgr, uid: number): { obj: AnimObj; index: number } | null {
  const n = safeNum(() => mgr.size);
  for (let i = 0; i < n; i++) {
    let obj: AnimObj | null;
    try {
      obj = mgr.getAt(i) as AnimObj | null;
    } catch {
      continue;
    }
    if (!obj) continue;
    if (safeNum(() => obj.uid) === uid) return { obj, index: i };
  }
  return null;
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
  const n = safeNum(() => mgr.size);
  for (let i = 0; i < n; i++) {
    let obj: AnimObj | null;
    try {
      obj = mgr.getAt(i) as AnimObj | null;
    } catch {
      continue;
    }
    if (!obj) continue;
    if (safeNum(() => obj.uid) === uid) continue;
    out.push({ name: safeStr(() => obj.name) });
  }
  return out;
}

/** Build the full detail for a uid, or null when the element is gone. */
function buildDetail(mgr: AnimMgr, uid: number): AnimElementDetail | null {
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
    case "timeRefName":
      w.timeRefName = String(value);
      tryResolveRel(mgr);
      break;
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

/** Recurse renderer groups, collecting leaf renderers under `objName`. */
function collectRenderers(
  node: SceneTreeNode,
  objName: string,
  out: AnimRendererOption[],
): void {
  for (const child of node.children ?? []) {
    if (child.type === "renderer") {
      if (child.name) out.push({ name: child.name, objName, type: child.className ?? "" });
    } else if (child.type === "rendGroup") {
      collectRenderers(child, objName, out);
    }
  }
}

// --- services ---

/** Read the full detail for a selected element (resolved by stable uid). */
function getAnimElementDetail(
  ctx: WorkerContext,
  args: GetAnimElementDetailArgs,
): GetAnimElementDetailResult {
  const mgr = resolveMgr(ctx, args.sceneId);
  if (!mgr) return { ok: false };
  const detail = buildDetail(mgr, args.uid);
  if (!detail) return { ok: false, gone: true };
  return { ok: true, detail };
}

/** Write one property of the element (undoable; returns the refreshed detail). */
function setAnimElementProp(
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
      applyProp(ctx, mgr, found.obj, args.prop, args.value);
    });
  } catch {
    return { ok: false };
  }
  if (gone) return { ok: false, gone: true };
  const detail = buildDetail(mgr, args.uid);
  if (!detail) return { ok: false, gone: true };
  return { ok: true, detail };
}

/** List renderer / camera / mol names for the target-picker dropdowns. */
function getAnimTargetOptions(
  ctx: WorkerContext,
  args: GetAnimTargetOptionsArgs,
): GetAnimTargetOptionsResult {
  const empty: GetAnimTargetOptionsResult = {
    ok: false,
    renderers: [],
    cameras: [],
    mols: [],
  };
  const scene = getSceneOrNull(ctx, args.sceneId);
  if (!scene) return empty;

  const renderers: AnimRendererOption[] = [];
  const mols: AnimMolOption[] = [];
  let tree: SceneTreeNode | null = null;
  try {
    tree = parseSceneTreeJSON(scene.getSceneDataJSON());
  } catch {
    tree = null;
  }
  if (tree) {
    for (const objNode of tree.children ?? []) {
      if (objNode.type !== "object") continue;
      if (objNode.className === "MorphMol") mols.push({ name: objNode.name });
      collectRenderers(objNode, objNode.name, renderers);
    }
  }

  const cameras: AnimCameraOption[] = [];
  try {
    const arr = JSON.parse(scene.getCameraInfoJSON()) as Array<{ name?: string }>;
    for (const c of arr) {
      if (c?.name) cameras.push({ name: c.name });
    }
  } catch {
    /* no cameras */
  }

  return { ok: true, renderers, cameras, mols };
}

export const services = {
  getAnimElementDetail,
  setAnimElementProp,
  getAnimTargetOptions,
};
