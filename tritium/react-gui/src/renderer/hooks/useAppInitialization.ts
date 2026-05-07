/**
 * @file hooks/useAppInitialization.ts
 * @description Creates the initial scene and view once CueMol is ready, and
 * registers them as the first molview tab. Guarded against React 18 StrictMode
 * double-invocation via a module-level ref.
 *
 * Extracted verbatim from App.tsx (pre-E) so that the side effect of "first
 * scene appears on launch" is preserved through E's structural refactor.
 */

import { useEffect, useRef } from 'react';
import type { SceneManager } from '@cuemol/core/src/wrappers/SceneManager';
import type { AsyncCueMol } from '../worker/client/AsyncCueMol';

interface UseAppInitializationOptions {
  cm: AsyncCueMol | null;
  cueMolReady: boolean;
  addMolTab: (title: string, viewId: number, sceneId: number) => void;
  addMolViewTab: (title: string, viewId: number) => void;
}

export function useAppInitialization({
  cm,
  cueMolReady,
  addMolTab,
  addMolViewTab,
}: UseAppInitializationOptions): void {
  const initialSceneCreatedRef = useRef(false);

  useEffect(() => {
    if (!cueMolReady || !cm) return;
    if (initialSceneCreatedRef.current) return;
    initialSceneCreatedRef.current = true;

    let cancelled = false;
    (async () => {
      const sceMgr = (await cm.getService('SceneManager')) as SceneManager;
      if (!sceMgr || cancelled) return;
      const scene = await sceMgr.createScene();
      const scene_uid = await scene.getUID();
      const view = await scene.createView();
      const view_uid = await view.getUID();
      if (cancelled) return;
      const title = `Scene ${scene_uid}`;
      // Register in MolTabState first so MolViewPane can read getActiveViewID()
      addMolTab(title, view_uid, scene_uid);
      // Open the outer tab (causes ContentPane to mount MolViewPane)
      addMolViewTab(title, view_uid);
    })();
    return () => { cancelled = true; };
  }, [cueMolReady, cm, addMolTab, addMolViewTab]);
}
