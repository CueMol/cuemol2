/**
 * @file hooks/useNewSceneAction.ts
 * @description UXP `Qm2Main.onNewScene(scname)` equivalent: a single entry
 * point used by both app launch (`useAppInitialization`) and the New Tab
 * dialog (`useNewTabCommand`) for creating a fresh scene + initial view +
 * registering the molview tab. UXP routes both code paths through the same
 * `onNewScene` -> `createNewScene` chain; this hook mirrors that.
 *
 * If `name` is omitted, asks the worker for a unique default name (matches
 * UXP's `util.makeUniqName(strbundle, "cuemol2_defaultSceneName", ...)`),
 * then forwards to `createNewSceneAndView`.
 *
 * The optional `bindView` flag (default true) controls whether the new view
 * is registered with the GfxManager via `addView`. App launch must pass
 * `false` because the initial view is attached to the canvas later by
 * `MolViewPane.bindCanvas`; calling `addView` before `bindCanvas` throws
 * (`gfx_manager.addView` requires `_canvas !== null`).
 */

import { useCallback } from 'react';
import type { AsyncCueMol } from '../worker/client/AsyncCueMol';
import { makeTabLabel } from '../worker/shared/tabLabel';

export interface NewSceneActionOptions {
  name?: string;
  bindView?: boolean;
}

export interface NewSceneActionResult {
  scene_uid: number;
  view_uid: number;
  scene_name: string;
  view_name: string;
  /** Composite tab title: `<scene_name>:<view_name>` (UXP makeTabLabel). */
  tab_title: string;
}

interface UseNewSceneActionOptions {
  cm: AsyncCueMol | null;
  addMolTab: (title: string, viewId: number, sceneId: number) => void;
  addMolViewTab: (title: string, viewId: number) => void;
}

export type NewSceneAction = (opts?: NewSceneActionOptions) => Promise<NewSceneActionResult | null>;

export function useNewSceneAction({
  cm,
  addMolTab,
  addMolViewTab,
}: UseNewSceneActionOptions): NewSceneAction {
  return useCallback(async (opts?: NewSceneActionOptions): Promise<NewSceneActionResult | null> => {
    if (!cm) return null;

    let resolvedName = opts?.name;
    if (!resolvedName) {
      const names = await cm.invokeService('proposeNewTabNames', {});
      if (!names) return null;
      resolvedName = names.defaultSceneName;
    }

    const dpr = window.devicePixelRatio || 1;
    const ids = await cm.createNewSceneAndView(dpr, resolvedName, opts?.bindView);
    if (!ids) return null;

    const { scene_uid, view_uid, scene_name, view_name } = ids;
    // Mirror UXP TabMolView.makeTabLabel: `<scene name>:<view name>`.
    const tab_title = makeTabLabel(scene_name, view_name);
    addMolTab(tab_title, view_uid, scene_uid);
    addMolViewTab(tab_title, view_uid);

    return { scene_uid, view_uid, scene_name, view_name, tab_title };
  }, [cm, addMolTab, addMolViewTab]);
}
