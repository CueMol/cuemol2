/**
 * @file hooks/useAnimEdit.ts
 * @description Strip-editing actions for `AnimationPanel` (move / resize / add /
 * remove / reorder).
 *
 * Thin `invokeService` wrappers with no local state: each mutation fires a
 * SEM_ANIM event on the C++ side, and `useAnimTimeline` refetches the timeline
 * in response, so the panel stays in sync without returning the new data here.
 */

import { useCallback, useRef } from "react";
import type { AsyncCueMol } from "../worker/client/AsyncCueMol";
import type { AnimAddType } from "../types";

interface UseAnimEditOptions {
  cm: AsyncCueMol | null;
  sceneId: number | undefined;
}

export interface UseAnimEditResult {
  /** Add a new element; `insertIndex` inserts before it (append when omitted). */
  addElement: (type: AnimAddType, insertIndex?: number) => void;
  /** Remove the element at `index`. */
  removeElement: (index: number) => void;
  /** Reorder: raw target index (i-1 to move up, i+1 to move down). */
  moveElement: (from: number, to: number) => void;
  /** Set an element's RELATIVE start/end (ms). */
  setElementTime: (index: number, startMs: number, endMs: number) => void;
}

/**
 * Editing actions for the active scene's animation timeline.
 *
 * @param opts - `cm` (worker client) and the active `sceneId`.
 * @returns add / remove / move / setElementTime callbacks (no-ops without a scene).
 */
export function useAnimEdit({ cm, sceneId }: UseAnimEditOptions): UseAnimEditResult {
  const cmRef = useRef(cm);
  cmRef.current = cm;
  const sceneIdRef = useRef(sceneId);
  sceneIdRef.current = sceneId;

  const addElement = useCallback((type: AnimAddType, insertIndex?: number) => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    if (!c || sid === undefined) return;
    c.invokeService("animAddElement", { sceneId: sid, type, insertIndex }).catch(
      (e: unknown) => console.warn("animAddElement failed:", e),
    );
  }, []);

  const removeElement = useCallback((index: number) => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    if (!c || sid === undefined) return;
    c.invokeService("animRemoveElement", { sceneId: sid, index }).catch(
      (e: unknown) => console.warn("animRemoveElement failed:", e),
    );
  }, []);

  const moveElement = useCallback((from: number, to: number) => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    if (!c || sid === undefined) return;
    c.invokeService("animMoveElement", { sceneId: sid, from, to }).catch(
      (e: unknown) => console.warn("animMoveElement failed:", e),
    );
  }, []);

  const setElementTime = useCallback(
    (index: number, startMs: number, endMs: number) => {
      const c = cmRef.current;
      const sid = sceneIdRef.current;
      if (!c || sid === undefined) return;
      c.invokeService("animSetElementTime", { sceneId: sid, index, startMs, endMs }).catch(
        (e: unknown) => console.warn("animSetElementTime failed:", e),
      );
    },
    [],
  );

  return { addElement, removeElement, moveElement, setElementTime };
}
