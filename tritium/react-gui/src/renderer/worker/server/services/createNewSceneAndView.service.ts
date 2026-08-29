// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';
import { createInitialView } from './helpers/createSceneView';

export interface CreateNewSceneAndViewArgs {
    dpr: number;
    name?: string;
    // Whether to register the new view with GfxManager via addView().
    // Defaults to true. Set to false for the initial app-launch scene whose
    // view is attached to the canvas by MolViewPane via bindCanvas() instead;
    // calling addView() before bindCanvas() throws ("not bound to canvas").
    bindView?: boolean;
}

export interface CreateNewSceneAndViewResult {
    scene_uid: number;
    view_uid: number;
    scene_name: string;
    view_name: string;
}

function createNewSceneAndView(
    ctx: WorkerContext,
    args: CreateNewSceneAndViewArgs
): CreateNewSceneAndViewResult {
    const scene = ctx.sceMgr.createScene();
    if (args.name) {
        scene.setName(args.name);
    }
    const scene_uid = scene.getUID();
    const { view_uid, view_name } = createInitialView(ctx, scene, args.dpr, args.bindView !== false);
    return {
        scene_uid,
        view_uid,
        scene_name: args.name ?? '',
        view_name,
    };
}

export const services = { createNewSceneAndView };
