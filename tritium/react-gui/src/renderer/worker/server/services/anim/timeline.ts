/**
 * @file worker/server/services/anim/timeline.ts
 * @description The strip: every element of a scene's animation, plus the
 * manager state the transport controls read.
 */
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { AnimElement, AnimMgrState, AnimTimeline } from "@renderer/types";
import { getSceneOrNull } from "@renderer/worker/server/services/helpers/sceneResolver";
import { getAnimMgrOrNull, forEachAnimObj } from "./resolve";
import { EMPTY_MGR_STATE, readCameraNames, readElement, readMgrState } from "./read";
import { DEFAULT_FPS } from "./types";
import type { AnimGetMgrStateArgs, AnimListTimelineArgs } from "./types";
// --- detail shapes ---

/**
 * List every `AnimObj` in the scene's `AnimMgr` as timeline strips.
 *
 * Resolves relative->absolute times first (a cyclic/missing `timeRefName`
 * makes `resolveRelTime()` throw; that is swallowed so one bad element cannot
 * blank the whole panel). Returns an empty timeline when the scene or manager
 * is unavailable.
 */
export function listTimeline(ctx: WorkerContext, args: AnimListTimelineArgs): AnimTimeline {
  const empty: AnimTimeline = {
    sceneId: args.sceneId,
    elements: [],
    mgr: EMPTY_MGR_STATE,
    cameras: [],
    fps: DEFAULT_FPS,
  };

  const scene = getSceneOrNull(ctx, args.sceneId);
  if (!scene) return empty;
  const mgr = getAnimMgrOrNull(scene);
  if (!mgr) return empty;

  // Resolve before reading absStart/absEnd. Leave prior abs values on throw.
  try {
    mgr.resolveRelTime();
  } catch {
    /* keep previously-resolved absolute times */
  }

  const elements: AnimElement[] = [];
  forEachAnimObj(mgr, (obj, i) => {
    elements.push(readElement(obj, i));
    return undefined;
  });

  return {
    sceneId: args.sceneId,
    elements,
    mgr: readMgrState(mgr),
    cameras: readCameraNames(scene),
    fps: DEFAULT_FPS,
  };
}

/** Cheap manager-only snapshot (poll target for playback in later phases). */
export function getMgrState(ctx: WorkerContext, args: AnimGetMgrStateArgs): AnimMgrState {
  const scene = getSceneOrNull(ctx, args.sceneId);
  if (!scene) return EMPTY_MGR_STATE;
  const mgr = getAnimMgrOrNull(scene);
  if (!mgr) return EMPTY_MGR_STATE;
  return readMgrState(mgr);
}
