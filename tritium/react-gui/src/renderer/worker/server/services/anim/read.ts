/**
 * @file worker/server/services/anim/read.ts
 * @description Reading an AnimMgr and its objects into plain data.
 *
 * Shared by the timeline (which lists everything) and playback (which reports
 * where the manager is now), so the two cannot describe the same manager
 * differently.
 */
import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { AnimObj } from "@cuemol/core/src/wrappers/AnimObj";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { AnimElement, AnimMgrState } from "@renderer/types";
import { classNameToType } from "./elementType";
import { safeNum, safeBool, safeStr } from "./resolve";
// --- detail shapes ---

/**
 * Map the `playState` enum to a stable string union.
 *
 * `playState` is declared `enum` in `AnimMgr.qif`; the generated wrapper types
 * it as `number` but the native layer returns the string id at runtime. Both
 * shapes are handled defensively.
 */
export function readPlayState(mgr: AnimMgr): AnimMgrState["playState"] {
  let raw: unknown;
  try {
    raw = mgr.playState as unknown;
  } catch {
    return "stop";
  }
  if (raw === "play" || raw === "pause" || raw === "stop") return raw;
  // Numeric fallback: AM_STOP=0 / AM_RUNNING=1 / AM_PAUSED=2.
  if (raw === 1) return "play";
  if (raw === 2) return "pause";
  return "stop";
}

/** Read the manager-level snapshot (length / elapsed / play state / loop). */
export function readMgrState(mgr: AnimMgr): AnimMgrState {
  return {
    lengthMs: safeNum(() => mgr.length.millisec),
    elapsedMs: safeNum(() => mgr.elapsed.millisec),
    playState: readPlayState(mgr),
    loop: safeBool(() => mgr.loop),
    startcam: safeStr(() => mgr.startcam),
  };
}

/** Read one `AnimObj` into an `AnimElement` (all times in ms). */
export function readElement(obj: AnimObj, index: number): AnimElement {
  return {
    index,
    uid: safeNum(() => obj.uid),
    name: safeStr(() => obj.name),
    type: classNameToType(obj),
    disabled: safeBool(() => obj.disabled),
    timeRefName: safeStr(() => obj.timeRefName),
    startMs: safeNum(() => obj.start.millisec),
    endMs: safeNum(() => obj.end.millisec),
    absStartMs: safeNum(() => obj.absStart.millisec),
    absEndMs: safeNum(() => obj.absEnd.millisec),
    quadric: safeNum(() => obj.quadric),
  };
}

export const EMPTY_MGR_STATE: AnimMgrState = {
  lengthMs: 0,
  elapsedMs: 0,
  playState: "stop",
  loop: false,
  startcam: "",
};

/**
 * Scene camera names, for the start-camera selector (UXP `<camerasel>` items).
 *
 * Cameras are not part of `getSceneDataJSON`; `getCameraInfoJSON` is the only
 * source (see the scene-content JSON table in `tritium/CLAUDE.md`).
 */
export function readCameraNames(scene: Scene): string[] {
  try {
    const arr = JSON.parse(scene.getCameraInfoJSON()) as Array<{ name?: string }>;
    return arr.map((c) => c?.name).filter((n): n is string => !!n);
  } catch {
    return [];
  }
}
