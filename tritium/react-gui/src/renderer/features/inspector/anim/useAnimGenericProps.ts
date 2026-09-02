/**
 * @file features/inspector/anim/useAnimGenericProps.ts
 * @description The animation inspector's Generic tab: the element's raw
 * properties, read and written by name.
 *
 * It is fetched in BOTH modes, not only while the Generic tab is showing: the
 * mode bar's Reset-all button derives its enabled state from these entries, so
 * the Properties tab needs them live too.
 *
 * The element identity arrives as refs rather than values because every
 * callback here has to stay reference-stable -- they are handed to rows that
 * would otherwise re-render on each keystroke -- while still addressing the
 * currently inspected element.
 */

import { useCallback, useRef, useState } from 'react';
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol';
import type { GenericPropEntry, PropWriteOpts } from '@renderer/worker/shared/genericProps';
import type { AnimGenericPropsResult } from '@renderer/worker/server/services/anim/anim.service';
import { modifiedKeys } from '@renderer/features/inspector/propModel';

export interface UseAnimGenericPropsOptions {
    cmRef: React.MutableRefObject<AsyncCueMol | null>;
    sceneIdRef: React.MutableRefObject<number>;
    uidRef: React.MutableRefObject<number>;
    /** Called when the element turns out to be gone (deleted). */
    onGoneRef: React.MutableRefObject<(sceneId: number) => void>;
}

export function useAnimGenericProps({
    cmRef, sceneIdRef, uidRef, onGoneRef,
}: UseAnimGenericPropsOptions) {
    const [genericEntries, setGenericEntries] = useState<GenericPropEntry[]>([]);
    const [genericLoading, setGenericLoading] = useState(false);
    // Stale-response guard: every request takes the next number and a reply
    // is dropped unless it is still the latest.
    const genericToken = useRef(0);
    const genericEntriesRef = useRef(genericEntries);
    genericEntriesRef.current = genericEntries;

  const refetchGeneric = useCallback(() => {
    const c = cmRef.current;
    const sid = sceneIdRef.current;
    const u = uidRef.current;
    if (!c) return;
    setGenericLoading(true);
    const token = ++genericToken.current;
    c.invokeService("getAnimElementGenericProps", { sceneId: sid, uid: u })
      .then((res) => {
        if (token !== genericToken.current) return;
        setGenericLoading(false);
        if (!res.ok) {
          if (res.gone) onGoneRef.current(sid);
          return;
        }
        setGenericEntries(res.entries);
      })
      .catch((e: unknown) => {
        setGenericLoading(false);
        console.warn("getAnimElementGenericProps failed:", e);
      });
  }, [cmRef, sceneIdRef, uidRef, onGoneRef]);

  const adoptGeneric = useCallback(
    (res: AnimGenericPropsResult, token: number) => {
      if (token !== genericToken.current) return;
      if (!res.ok) {
        if (res.gone) onGoneRef.current(sceneIdRef.current);
        return;
      }
      setGenericEntries(res.entries);
    },
    [onGoneRef, sceneIdRef],
  );
  // A realtime drag passes `opts` (preview / commit / abort, see
  // `PropWriteOpts`). Only a commit's reply carries entries to adopt; a
  // preview or abort answers with none, and the list follows through the
  // SEM_ANIM refetch -- which a token bump here would make it drop.
  const handleGenericSet = useCallback(
    (key: string, valueType: string, value: string | number | boolean, opts?: PropWriteOpts) => {
      const c = cmRef.current;
      if (!c) return;
      const mode = opts?.mode ?? "commit";
      const token = mode === "commit" ? ++genericToken.current : 0;
      return c.invokeService("setAnimElementGenericProp", {
        sceneId: sceneIdRef.current,
        uid: uidRef.current,
        propName: key,
        op: "set",
        valueType,
        value,
        mode: opts?.mode,
        originalValue: opts?.originalValue,
        originalWasDefault: opts?.originalWasDefault,
      })
        .then((res) => {
          if (mode !== "commit") {
            if (!res.ok && res.gone) onGoneRef.current(sceneIdRef.current);
            return;
          }
          adoptGeneric(res, token);
        })
        .catch((e: unknown) => console.warn("setAnimElementGenericProp failed:", e));
    },
    [adoptGeneric, cmRef, sceneIdRef, uidRef, onGoneRef],
  );
  const handleGenericReset = useCallback(
    (key: string) => {
      const c = cmRef.current;
      if (!c) return;
      const token = ++genericToken.current;
      c.invokeService("setAnimElementGenericProp", {
        sceneId: sceneIdRef.current,
        uid: uidRef.current,
        propName: key,
        op: "reset",
        valueType: "",
      })
        .then((res) => adoptGeneric(res, token))
        .catch((e: unknown) => console.warn("setAnimElementGenericProp (reset) failed:", e));
    },
    [adoptGeneric, cmRef, sceneIdRef, uidRef],
  );
  const handleResetAll = useCallback(() => {
    const c = cmRef.current;
    if (!c) return;
    const keys = modifiedKeys(genericEntriesRef.current);
    if (keys.length === 0) return;
    const token = ++genericToken.current;
    c.invokeService("resetAnimElementGenericProps", {
      sceneId: sceneIdRef.current,
      uid: uidRef.current,
      propNames: keys,
    })
      .then((res) => adoptGeneric(res, token))
      .catch((e: unknown) => console.warn("resetAnimElementGenericProps failed:", e));
  }, [adoptGeneric, cmRef, sceneIdRef, uidRef]);

    return {
        genericEntries,
        genericLoading,
        refetchGeneric,
        handleGenericSet,
        handleGenericReset,
        handleResetAll,
        /** True while any property differs from its default. */
        canResetAll: modifiedKeys(genericEntries).length > 0,
    };
}
