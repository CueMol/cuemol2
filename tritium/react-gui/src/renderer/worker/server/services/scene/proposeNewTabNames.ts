// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { proposeUniqName } from './proposeUniqName';

export interface ProposeNewTabNamesArgs {
    sceneId?: number;
}

export interface ProposeNewTabNamesResult {
    currentSceneName: string | null;
    defaultSceneName: string;
    defaultViewName: string;
}

export function proposeNewTabNames(
    ctx: WorkerContext,
    args: ProposeNewTabNamesArgs,
): ProposeNewTabNamesResult {
    // Mirrors UXP mainView.properties (en-US): "Untitled %1$S" for scenes,
    // "%1$S" (number only) for views. Locale switching is intentionally
    // omitted (no i18n in tritium yet).
    const defaultSceneName = proposeUniqName(ctx, { kind: 'scene', prefix: 'Untitled ' }).name;

    if (args.sceneId === undefined) {
        return { currentSceneName: null, defaultSceneName, defaultViewName: '1' };
    }

    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) {
        return { currentSceneName: null, defaultSceneName, defaultViewName: '1' };
    }

    const rawName: string = scene.name;
    const currentSceneName = rawName || null;

    const defaultViewName = proposeUniqName(ctx, {
        kind: 'view',
        prefix: '',
        sceneId: args.sceneId,
    }).name;

    return {
        currentSceneName,
        defaultSceneName,
        defaultViewName,
    };
}
