// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Phase: panel.workspace.ctxmenu.object — "New Group..." item.
// Mirrors UXP `ws.onNewRendGrp` in `workspace_panel.js`: pick a unique
// `groupN` name (scene-wide), `obj.createRenderer('*group')`, assign the
// chosen name, all inside a "Create renderer group: <name>" undo txn.

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '../types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';

export interface CreateRendererGroupArgs {
    sceneId: number;
    objId: number;
    /**
     * Desired name. If omitted or blank, the service auto-generates
     * `group1`, `group2`, ... matching UXP `makeUniqName2` semantics.
     * If provided, the worker rejects the call when the name is already
     * taken scene-wide.
     */
    name?: string;
}

export interface CreateRendererGroupResult {
    ok: boolean;
    /** Uid of the new `*group` renderer on success. */
    newRendId?: number;
    /** Final resolved name (after auto-generation, if applicable). */
    newName?: string;
}

/** Pick `group1`, `group2`, ... — UXP `makeUniqName2` starts at i=1. */
function uniqDefaultGroupName(exists: (name: string) => boolean): string {
    for (let i = 1; i < 10000; i++) {
        const candidate = `group${i}`;
        if (!exists(candidate)) return candidate;
    }
    return `group${Date.now()}`;
}

function createRendererGroup(
    ctx: WorkerContext,
    args: CreateRendererGroupArgs,
): CreateRendererGroupResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return { ok: false };
    const obj = scene.getObject(args.objId) as CueMolObject | null;
    if (!obj) return { ok: false };

    // UXP `onNewRendGrp` uses scene-wide getRendByName for uniqueness so
    // group names don't collide with sibling renderers on other objects.
    const exists = (n: string): boolean => !!scene.getRendByName(n);

    const requested = (args.name ?? '').trim();
    let finalName: string;
    if (requested.length === 0) {
        finalName = uniqDefaultGroupName(exists);
    } else {
        if (exists(requested)) return { ok: false };
        finalName = requested;
    }

    let newRendId = -1;
    withUndoTxn(scene, `Create renderer group: ${finalName}`, () => {
        const rend = obj.createRenderer('*group') as unknown as Renderer | null;
        if (!rend) return;
        try { rend.name = finalName; } catch { /* '*group' should accept name set */ }
        newRendId = (rend as unknown as { uid: number }).uid;
    });

    if (newRendId < 0) return { ok: false };
    return { ok: true, newRendId, newName: finalName };
}

export const services = {
    createRendererGroup,
};
