/**
 * @file features/animation/useAnimTimeline.ts
 * @description Live animation-timeline state for `AnimationPanel`.
 *
 * Fetches the timeline (`AnimMgr` element list + manager snapshot) from the
 * worker via `cm.invokeService('animListTimeline', ...)` and refetches when any
 * SEM_ANIM event fires, so the strip view stays in sync with edits made by
 * undo/redo, scripts, or other code paths. Follows the fetch+event pattern of
 * `useSceneTree.ts` (debounced refetch on an event burst). This phase is
 * read-only.
 */

import { useRef } from "react";
import type { AsyncCueMol } from "@renderer/worker/client/AsyncCueMol";
import type { AnimTimeline } from "@renderer/types";
import { SEM_ANIM, SEM_CAMERA, SEM_SCENE, SEM_ANY } from "@renderer/event";
import { useLiveFetch } from "@renderer/hooks/cuemol/useLiveFetch";
import { EVENT_BURST_DEBOUNCE_MS } from "@renderer/utils/timing";

interface UseAnimTimelineOptions {
  cm: AsyncCueMol | null;
  /** Active scene UID, or undefined when no scene is active. */
  sceneId: number | undefined;
}

export interface UseAnimTimelineResult {
  /** Latest timeline snapshot, or null when no scene / not yet loaded. */
  timeline: AnimTimeline | null;
  /** True while a fetch is in flight. */
  loading: boolean;
  /** Force a refetch (also used as the event handler). */
  refetch: () => void;
}

/**
 * Subscribe to the active scene's animation timeline.
 *
 * @param opts - `cm` (worker client) and the active `sceneId`.
 * @returns The timeline snapshot, a loading flag, and a `refetch` callback.
 */
export function useAnimTimeline({
  cm,
  sceneId,
}: UseAnimTimelineOptions): UseAnimTimelineResult {
  // Latest sceneId in a ref so `refetch` identity stays stable.
  const sceneIdRef = useRef<number | undefined>(sceneId);
  sceneIdRef.current = sceneId;

  const {
    state: timeline,
    loading,
    refetch,
  } = useLiveFetch<AnimTimeline | null>({
    cm,
    initial: null,
    fallback: null,
    exposeLoading: true,
    fetch: () => {
      const sid = sceneIdRef.current;
      if (!cm || sid === undefined) return null;
      return cm
        .invokeService("animListTimeline", { sceneId: sid })
        .then((res) => res ?? null)
        .catch((err: unknown) => {
          console.warn("animListTimeline failed:", err);
          return null;
        });
    },
    fetchDeps: [sceneId],
    // Keep in sync with C++-side mutations (undo/redo, scripts, other tabs).
    listeners: [
      {
        enabled: sceneId !== undefined,
        srcMask: SEM_ANIM,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        debounceMs: EVENT_BURST_DEBOUNCE_MS,
      },
      // The start-camera selector lists the scene's cameras, which change
      // outside SEM_ANIM (Explorer create / delete / rename, scene load).
      // Same masks as the UXP `<camerasel>` widget binding.
      {
        enabled: sceneId !== undefined,
        srcMask: SEM_CAMERA | SEM_SCENE,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        debounceMs: EVENT_BURST_DEBOUNCE_MS,
      },
    ],
  });

  return { timeline, loading, refetch };
}
