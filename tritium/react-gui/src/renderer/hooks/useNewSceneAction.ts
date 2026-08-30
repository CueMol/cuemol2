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
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol';
import { fail, ok, type Result } from '@renderer/worker/shared/result';
import { makeTabLabel } from '@renderer/worker/shared/tabLabel';
import { useWorkspaceDispatch } from '@renderer/state/workspace';

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
}

export type NewSceneAction = (opts?: NewSceneActionOptions) => Promise<NewSceneActionResult | null>;

/**
 * Open a scene file in a tab of its own.
 *
 * @param filePath - scene file to read.
 * @returns The registered tab's ids on success; a `Fail` carrying the
 *   worker's reason when the file could not be read (nothing is created).
 */
export type OpenSceneFileAction = (filePath: string) => Promise<Result<NewSceneActionResult>>;

/**
 * Open a scene file into a scene of its own and show it as a new tab.
 *
 * The worker creates the scene, reads the file and only then creates the
 * view (`openSceneFile`), so a failed read leaves nothing behind and the tab
 * registered here always has a loaded scene under it.
 */
export function useOpenSceneFileAction({ cm }: UseNewSceneActionOptions): OpenSceneFileAction {
  const { openMolViewTab } = useWorkspaceDispatch();
  return useCallback(async (filePath: string): Promise<Result<NewSceneActionResult>> => {
    if (!cm) return fail('CueMol is not ready', 'unsupported');

    const dpr = window.devicePixelRatio || 1;
    const res = await cm.invokeService('openSceneFile', { filePath, dpr });
    if (!res.ok) return res;

    const { scene_uid, view_uid, scene_name, view_name } = res;
    const tab_title = makeTabLabel(scene_name, view_name);
    openMolViewTab(tab_title, view_uid, scene_uid);

    return ok({ scene_uid, view_uid, scene_name, view_name, tab_title });
  }, [cm, openMolViewTab]);
}

export function useNewSceneAction({ cm }: UseNewSceneActionOptions): NewSceneAction {
  const { openMolViewTab } = useWorkspaceDispatch();
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
    openMolViewTab(tab_title, view_uid, scene_uid);

    return { scene_uid, view_uid, scene_name, view_name, tab_title };
  }, [cm, openMolViewTab]);
}
