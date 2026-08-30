// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';

export interface IsSceneJustCreatedArgs {
    sceneId: number;
}

export interface IsSceneJustCreatedResult {
    justCreated: boolean;
}

/**
 * Report whether a scene is "just created" -- unmodified with no objects and
 * no saved cameras (C++ `Scene::isJustCreated()`).
 *
 * Mirrors the `scene.isJustCreated()` gate in UXP `openSceneImpl`: opening a
 * .qsc into a just-created current scene loads into it in place, while a
 * non-empty or modified scene gets a new scene/tab. See useSceneCommands
 * `openNewScene` for the renderer-side branch.
 */
function isSceneJustCreated(
    ctx: WorkerContext,
    args: IsSceneJustCreatedArgs,
): IsSceneJustCreatedResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return { justCreated: false };
    return { justCreated: scene.isJustCreated() };
}

export const services = { isSceneJustCreated };
