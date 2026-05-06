// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';

export interface CreateNewSceneAndViewArgs {
    dpr: number;
    name?: string;
}

export interface CreateNewSceneAndViewResult {
    scene_uid: number;
    view_uid: number;
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
    const view = scene.createView();
    view.name = '0';
    const view_uid = view.getUID();
    ctx.svc.addView(view_uid, args.dpr);
    return { scene_uid, view_uid };
}

export const services = { createNewSceneAndView };
