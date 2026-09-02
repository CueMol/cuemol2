import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { TimeValue } from "@cuemol/core/src/wrappers/TimeValue";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import { getSceneOrNull } from "../helpers/sceneResolver";
import { buildTimeRefGraph, type TimeRefGraph, type TimeRefInput } from "./timeRefGraph";
// --- safe wrapper reads (a getter may throw for missing-on-subclass cases) ---

export function safeNum(read: () => number): number {
  try {
    const v = read();
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export function safeBool(read: () => boolean): boolean {
  try {
    return read() === true;
  } catch {
    return false;
  }
}

export function safeStr(read: () => string): string {
  try {
    return read() ?? "";
  } catch {
    return "";
  }
}

/** Resolve the scene's AnimMgr, or null. */
export function getAnimMgrOrNull(scene: Scene): AnimMgr | null {
  try {
    return (scene.getAnimMgr() as AnimMgr | null) ?? null;
  } catch {
    return null;
  }
}

/** Resolve the scene's AnimMgr from a scene id, or null. */
export function resolveMgr(ctx: WorkerContext, sceneId: number): AnimMgr | null {
  const scene = getSceneOrNull(ctx, sceneId);
  if (!scene) return null;
  return getAnimMgrOrNull(scene);
}

/** Resolve scene + its AnimMgr together (editing needs the scene for undo). */
export function resolveSceneMgr(
  ctx: WorkerContext,
  sceneId: number,
): { scene: Scene; mgr: AnimMgr } | null {
  const scene = getSceneOrNull(ctx, sceneId);
  if (!scene) return null;
  const mgr = getAnimMgrOrNull(scene);
  if (!mgr) return null;
  return { scene, mgr };
}

/**
 * Iterate every live AnimObj in the manager, calling `fn(obj, index)` for each.
 *
 * Centralises the AnimMgr scan scaffold shared by the animation services:
 * the size is read defensively via `safeNum` (0 on throw), an entry whose
 * `getAt(i)` throws is skipped (continue), and a null entry is skipped.
 *
 * Early stop: if `fn` returns a value other than `undefined`, iteration stops
 * and that value is returned (used by uid lookups). When `fn` never returns a
 * value, the whole list is scanned and `undefined` is returned.
 *
 * @param mgr - the AnimMgr to scan
 * @param fn - callback invoked per live object; return non-undefined to stop
 * @returns the first non-undefined value returned by `fn`, else `undefined`
 */
export function forEachAnimObj<R>(
  mgr: AnimMgr,
  fn: (obj: AnimObj, index: number) => R | undefined,
): R | undefined {
  const n = safeNum(() => mgr.size);
  for (let i = 0; i < n; i++) {
    let obj: AnimObj | null;
    try {
      obj = mgr.getAt(i) as AnimObj | null;
    } catch {
      continue;
    }
    if (!obj) continue;
    const r = fn(obj, i);
    if (r !== undefined) return r;
  }
  return undefined;
}

/**
 * Collect every live AnimObj in the manager into an array, in index order.
 *
 * Thin wrapper over {@link forEachAnimObj} for call sites that just need the
 * full list. Entries that throw or are null are skipped (see forEachAnimObj).
 *
 * @param mgr - the AnimMgr to scan
 * @returns the live objects in attachment order
 */
export function collectAnimObjs(mgr: AnimMgr): AnimObj[] {
  const out: AnimObj[] = [];
  forEachAnimObj(mgr, (obj) => {
    out.push(obj);
    return undefined;
  });
  return out;
}

/** True for a finite number of milliseconds (what every time write accepts). */
export function isFiniteMs(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Build a fresh TimeValue with the given millisec, or null on failure. The
 * value is rounded to whole milliseconds: a strip drag produces fractional
 * pixels-per-ms, and the timeline compares spans for equality.
 */
export function makeTimeValue(ctx: WorkerContext, ms: number): TimeValue | null {
  const tv = ctx.svc.createObj("TimeValue") as TimeValue | null;
  if (!tv) return null;
  tv.millisec = Math.round(ms);
  return tv;
}

/**
 * Ask C++ to resolve relative -> absolute times; null on success, else the
 * reason (`AnimMgr::resolveRelTime` throws on a cyclic or missing reference).
 * The services validate with `timeRefGraph` before writing, so this is only
 * the refresh the timeline listing runs (a loaded file has never resolved).
 */
export function tryResolveRel(mgr: AnimMgr): string | null {
  try {
    mgr.resolveRelTime();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function toTimeRefInput(obj: AnimObj): TimeRefInput {
  return {
    uid: safeNum(() => obj.uid),
    name: safeStr(() => obj.name),
    timeRefName: safeStr(() => obj.timeRefName),
    startMs: safeNum(() => obj.start.millisec),
    endMs: safeNum(() => obj.end.millisec),
  };
}

/** The names and RELATIVE spans `buildTimeRefGraph` resolves, in index order. */
export function readTimeRefInputs(mgr: AnimMgr): TimeRefInput[] {
  const out: TimeRefInput[] = [];
  forEachAnimObj(mgr, (obj) => {
    out.push(toTimeRefInput(obj));
    return undefined;
  });
  return out;
}

/** The chain graph plus the wrappers and manager indices its nodes stand for. */
export interface AnimGraphRead {
  graph: TimeRefGraph;
  /** `objs[k]` is the wrapper behind `graph.nodes[k]`. */
  objs: AnimObj[];
  /** `indices[k]` is the manager (`getAt`) index of `graph.nodes[k]`. */
  indices: number[];
}

/**
 * Read the manager once and resolve its chain. Node positions are compact
 * (an entry `getAt` refuses is skipped), so a service that needs the manager
 * index uses `indices`, not the node's position.
 */
export function readAnimGraph(mgr: AnimMgr): AnimGraphRead {
  const objs: AnimObj[] = [];
  const indices: number[] = [];
  const inputs: TimeRefInput[] = [];
  forEachAnimObj(mgr, (obj, i) => {
    objs.push(obj);
    indices.push(i);
    inputs.push(toTimeRefInput(obj));
    return undefined;
  });
  return { graph: buildTimeRefGraph(inputs), objs, indices };
}
