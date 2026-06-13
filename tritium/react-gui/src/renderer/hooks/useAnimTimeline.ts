/**
 * @file hooks/useAnimTimeline.ts
 * @description Live animation-timeline state for `AnimationPanel`.
 *
 * Fetches the timeline (`AnimMgr` element list + manager snapshot) from the
 * worker via `cm.invokeService('animListTimeline', ...)` and refetches when any
 * SEM_ANIM event fires, so the strip view stays in sync with edits made by
 * undo/redo, scripts, or other code paths. Follows the fetch+event pattern of
 * `useSceneTree.ts` (debounced refetch on an event burst). This phase is
 * read-only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AsyncCueMol } from "../worker/client/AsyncCueMol";
import type { AnimTimeline } from "../types";
import { SEM_ANIM, SEM_ANY } from "../event";
import { useCueMolEventListener } from "./useCueMolEventListener";

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

// Coalesce event bursts: a single edit (add/remove/move) fires several
// SEM_ANIM events in quick succession; one refetch is enough.
const REFETCH_DEBOUNCE_MS = 30;

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
  const [timeline, setTimeline] = useState<AnimTimeline | null>(null);
  const [loading, setLoading] = useState(false);

  // Latest sceneId in a ref so `refetch` identity stays stable.
  const sceneIdRef = useRef<number | undefined>(sceneId);
  sceneIdRef.current = sceneId;
  // Drop a stale fetch that resolves after a newer scene switch.
  const fetchTokenRef = useRef(0);

  const refetch = useCallback(() => {
    const sid = sceneIdRef.current;
    if (!cm || sid === undefined) {
      setTimeline(null);
      return;
    }
    const token = ++fetchTokenRef.current;
    setLoading(true);
    cm.invokeService("animListTimeline", { sceneId: sid })
      .then((res) => {
        if (token !== fetchTokenRef.current) return;
        setTimeline(res ?? null);
      })
      .catch((err: unknown) => {
        if (token !== fetchTokenRef.current) return;
        console.warn("animListTimeline failed:", err);
        setTimeline(null);
      })
      .finally(() => {
        if (token === fetchTokenRef.current) setLoading(false);
      });
  }, [cm]);

  // Initial fetch + re-fetch on scene switch.
  useEffect(() => {
    refetch();
  }, [cm, sceneId, refetch]);

  // Keep in sync with C++-side mutations (undo/redo, scripts, other tabs).
  useCueMolEventListener({
    cm,
    enabled: sceneId !== undefined,
    category: "",
    srcMask: SEM_ANIM,
    evtMask: SEM_ANY,
    scopeId: sceneId ?? -1,
    handler: refetch,
    debounceMs: REFETCH_DEBOUNCE_MS,
  });

  return { timeline, loading, refetch };
}
