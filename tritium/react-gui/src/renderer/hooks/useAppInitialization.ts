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

import { useEffect, useRef, useState } from 'react';
import type { NewSceneAction } from './useNewSceneAction';

interface UseAppInitializationOptions {
  cueMolReady: boolean;
  newScene: NewSceneAction;
}

interface UseAppInitializationResult {
  /**
   * True once the launch scene has been dealt with, successfully or not.
   *
   * Gates work that must not race the initial scene. `useShellOpenFiles` waits
   * on it so a .qsc named on the command line loads in place into this first
   * empty tab (`openNewScene` checks `isSceneJustCreated`) instead of opening a
   * second one. Set on failure too: a missing launch scene degrades the
   * in-place load to a fresh tab, but must never strand the file.
   */
  initialSceneSettled: boolean;
}

export function useAppInitialization({
  cueMolReady,
  newScene,
}: UseAppInitializationOptions): UseAppInitializationResult {
  const initialSceneCreatedRef = useRef(false);
  const [initialSceneSettled, setInitialSceneSettled] = useState(false);

  useEffect(() => {
    if (!cueMolReady) return;
    if (initialSceneCreatedRef.current) return;
    initialSceneCreatedRef.current = true;

    let cancelled = false;
    (async () => {
      let result: unknown;
      try {
        result = await newScene({ bindView: false });
      } catch (err) {
        // A failed launch scene must not leave the gate closed: it also
        // releases useShellOpenFiles, so a file passed on the command line or
        // opened from Finder would be dropped for the rest of the session.
        console.warn('initial scene creation failed:', err);
        result = undefined;
      }
      if (cancelled) return;
      if (!result) {
        // Clear the guard so an explicit New Scene can still take this path.
        initialSceneCreatedRef.current = false;
      }
      setInitialSceneSettled(true);
    })();
    return () => { cancelled = true; };
  }, [cueMolReady, newScene]);

  return { initialSceneSettled };
}
