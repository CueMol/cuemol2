/**
 * @file services/helpers/animResolve.ts
 * @description Shared worker-side helpers for the animation services
 * (`animation.service.ts`, `animDetail.service.ts`): scene/AnimMgr resolution,
 * TimeValue construction, and safe wrapper reads.
 *
 * Lifted here so both anim services use one implementation. Wrapper calls are
 * synchronous in the Web Worker thread.
 */

import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { TimeValue } from "@cuemol/core/src/wrappers/TimeValue";
import type { WorkerContext } from "../../types/WorkerContext";
import { getSceneOrNull } from "./sceneResolver";

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

/** Build a fresh TimeValue with the given millisec, or null on failure. */
export function makeTimeValue(ctx: WorkerContext, ms: number): TimeValue | null {
  const tv = ctx.svc.createObj("TimeValue") as TimeValue | null;
  if (!tv) return null;
  tv.millisec = ms;
  return tv;
}
