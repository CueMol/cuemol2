// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';
import { services as uniqNameSvc } from './proposeUniqName.service';

export interface ProposeNewTabNamesArgs {
    sceneId?: number;
}

export interface ProposeNewTabNamesResult {
    currentSceneName: string | null;
    defaultSceneName: string;
    defaultViewName: string;
}

function proposeNewTabNames(
    ctx: WorkerContext,
    args: ProposeNewTabNamesArgs,
): ProposeNewTabNamesResult {
    const defaultSceneName = uniqNameSvc.proposeUniqName(ctx, { kind: 'scene', prefix: 'Scene_' }).name;

    if (args.sceneId === undefined) {
        return { currentSceneName: null, defaultSceneName, defaultViewName: 'View_1' };
    }

    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) {
        return { currentSceneName: null, defaultSceneName, defaultViewName: 'View_1' };
    }

    // Fall back to "Scene_{uid}" when the C++ name is empty (e.g. initial scene
    // created directly in App.tsx without calling scene.setName).
    const rawName: string = scene.name;
    const currentSceneName = rawName || `Scene_${scene.getUID()}`;

    const defaultViewName = uniqNameSvc.proposeUniqName(ctx, {
        kind: 'view',
        prefix: 'View_',
        sceneId: args.sceneId,
    }).name;

    return {
        currentSceneName,
        defaultSceneName,
        defaultViewName,
    };
}

export const services = { proposeNewTabNames };
