/**
 * @file worker/server/services/anim/timeline.ts
 * @description The strip: every element of a scene's animation, plus the
 * manager state the transport controls read.
 */
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { AnimMgrState, AnimTimeline } from "@renderer/types";
import { getSceneOrNull } from "@renderer/worker/server/services/helpers/sceneResolver";
import { getAnimMgrOrNull, readAnimGraph, tryResolveRel } from "./resolve";
import { EMPTY_MGR_STATE, readCameraNames, readElement, readMgrState } from "./read";
import { describeResolveFailure } from "./timeRefGraph";
import { DEFAULT_FPS } from "./types";
import type { AnimGetMgrStateArgs, AnimListTimelineArgs } from "./types";
// --- detail shapes ---

/**
 * List every `AnimObj` in the scene's `AnimMgr` as timeline strips.
 *
 * The chain is resolved twice, on purpose. C++ `resolveRelTime()` refreshes
 * the manager's own absolute times (a file that was just loaded has never
 * resolved); it throws on a cyclic or missing reference, which is caught.
 * The TS graph then supplies the absolute span of every element that
 * resolves and the state / reason of every element that does not, so one
 * broken element neither blanks the panel nor hides behind stale numbers.
 * Returns an empty timeline when the scene or manager is unavailable.
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

  tryResolveRel(mgr);
  const { graph, objs, indices } = readAnimGraph(mgr);
  const elements = objs.map((obj, k) => readElement(obj, indices[k], graph.nodes[k]));
  const resolveError = describeResolveFailure(graph);

  return {
    sceneId: args.sceneId,
    elements,
    ...(resolveError !== null ? { resolveError } : {}),
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
