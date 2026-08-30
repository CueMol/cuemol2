/**
 * @file worker/server/services/helpers/sceneResolver.ts
 * @description Resolve worker-side scene / view / object handles with a
 * uniform null-check pattern. Replaces the inline
 * `ctx.sceMgr.getScene(id) as Scene | null; if (!scene) return ...`
 * boilerplate scattered across services.
 *
 * Each helper returns `null` (or a chain `null`) when the lookup fails;
 * the caller decides the failure shape (e.g. `{ ok: false }`).
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';

export function getSceneOrNull(ctx: WorkerContext, sceneId: number): Scene | null {
    return (ctx.sceMgr.getScene(sceneId) as Scene | null) ?? null;
}

export function getViewOrNull(ctx: WorkerContext, viewId: number): GUIView | null {
    return (ctx.sceMgr.getView(viewId) as GUIView | null) ?? null;
}

export function getViewSceneOrNull(
    ctx: WorkerContext,
    viewId: number,
): { view: GUIView; scene: Scene } | null {
    const view = getViewOrNull(ctx, viewId);
    if (!view) return null;
    const scene = view.getScene() as Scene | null;
    if (!scene) return null;
    return { view, scene };
}

export function getViewSceneObjOrNull<T extends CueMolObject = CueMolObject>(
    ctx: WorkerContext,
    viewId: number,
    objId: number,
): { view: GUIView; scene: Scene; obj: T } | null {
    const vs = getViewSceneOrNull(ctx, viewId);
    if (!vs) return null;
    const obj = vs.scene.getObject(objId) as T | null;
    if (!obj) return null;
    return { ...vs, obj };
}
