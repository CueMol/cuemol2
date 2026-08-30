// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';

export interface GetSceneCloseInfoArgs {
    viewId: number;
}

export interface GetSceneCloseInfoResult {
    ok: boolean;
    modified: boolean;
    viewCount: number;
    sceneName: string;
    sceneId: number;
}

function getSceneCloseInfo(ctx: WorkerContext, args: GetSceneCloseInfoArgs): GetSceneCloseInfoResult {
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    if (!view) return { ok: false, modified: false, viewCount: 0, sceneName: '', sceneId: -1 };
    const scene = view.getScene() as Scene;
    if (!scene) return { ok: false, modified: false, viewCount: 0, sceneName: '', sceneId: -1 };
    return {
        ok: true,
        modified: scene.modified,
        viewCount: scene.getViewCount(),
        sceneName: scene.name ?? '',
        sceneId: scene.uid,
    };
}

export const services = { getSceneCloseInfo };
