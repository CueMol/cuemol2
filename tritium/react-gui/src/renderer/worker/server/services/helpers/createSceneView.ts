/**
 * @file renderer/worker/server/services/helpers/createSceneView.ts
 * @description Create a scene's initial view, shared by the "new scene" and
 * "open scene file" paths so both name and bind it identically.
 */

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '../../types/WorkerContext';

/** Name given to the view a scene starts with (UXP parity). */
export const INITIAL_VIEW_NAME = '0';

export interface InitialView {
    view_uid: number;
    view_name: string;
}

/**
 * Create the initial view of `scene` and (optionally) register it with the
 * GfxManager.
 *
 * @param ctx - worker context.
 * @param scene - scene to create the view in.
 * @param dpr - device pixel ratio passed to `addView`.
 * @param bindView - false skips `addView`. App launch must pass false: its
 *   view is attached to the canvas later by `MolViewPane.bindCanvas`, and
 *   `addView` before `bindCanvas` throws ("not bound to canvas").
 * @returns The new view's uid and name.
 */
export function createInitialView(
    ctx: WorkerContext,
    scene: Scene,
    dpr: number,
    bindView = true,
): InitialView {
    const view = scene.createView();
    view.name = INITIAL_VIEW_NAME;
    const view_uid = view.getUID();
    if (bindView) {
        ctx.svc.addView(view_uid, dpr);
    }
    return { view_uid, view_name: INITIAL_VIEW_NAME };
}
