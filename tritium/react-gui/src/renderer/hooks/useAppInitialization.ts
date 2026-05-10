/**
 * @file hooks/useAppInitialization.ts
 * @description Creates the initial scene and view once CueMol is ready, by
 * delegating to `useNewSceneAction` (the same code path used by File > New
 * Tab). UXP routes both app launch and File > New Tab through a single
 * `Qm2Main.onNewScene(scname)` entry; this hook mirrors that by calling the
 * shared action with `name` omitted (so it picks up the default name from
 * the worker, e.g. "Untitled 1").
 *
 * `bindView: false` is required because the initial view is attached to the
 * canvas by `MolViewPane.bindCanvas` after this effect runs. Calling
 * `addView` before `bindCanvas` would throw in `gfx_manager`.
 *
 * Guarded against React 18 StrictMode double-invocation via a module-level
 * ref.
 */

import { useEffect, useRef } from 'react';
import type { NewSceneAction } from './useNewSceneAction';

interface UseAppInitializationOptions {
  cueMolReady: boolean;
  newScene: NewSceneAction;
}

export function useAppInitialization({
  cueMolReady,
  newScene,
}: UseAppInitializationOptions): void {
  const initialSceneCreatedRef = useRef(false);

  useEffect(() => {
    if (!cueMolReady) return;
    if (initialSceneCreatedRef.current) return;
    initialSceneCreatedRef.current = true;

    let cancelled = false;
    (async () => {
      const result = await newScene({ bindView: false });
      if (cancelled) return;
      if (!result) {
        // Allow retry on next ready/newScene change in case of failure.
        initialSceneCreatedRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [cueMolReady, newScene]);
}
