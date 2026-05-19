// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Phase 4d: panel.workspace ctxmenu "New Renderer..." (object / renderer /
// rendGroup entry points). Mirrors UXP `Qm2Main.setupRendByObjID`
// (`renderer.js`). The actual renderer-creation work is shared with the
// file-open flow via `setupRenderer.service.ts` — UXP also reuses the
// same setup logic between file-open and new-renderer.

import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { WorkerContext } from '../types/WorkerContext';
import type { RendererOptions } from '../../../components/fopen-opt-dlgs/types';
import { setupRenderer } from './setupRenderer.service';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';

export interface CreateRendererOnObjectArgs {
    sceneId: number;
    objId: number;
    rendOpts: RendererOptions;
    /** Optional group name — when set, the new renderer's `group` is
     *  assigned right after creation (UXP `setupRendByObjID` 2nd arg). */
    groupName?: string;
}

export interface CreateRendererOnObjectResult {
    ok: boolean;
    newRendId?: number;
    newName?: string;
}

function createRendererOnObject(
    ctx: WorkerContext,
    args: CreateRendererOnObjectArgs,
): CreateRendererOnObjectResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const obj = scene.getObject(args.objId) as CueMolObject | null;
    if (!obj) return { ok: false };

    let newRendId = -1;
    let newName = '';
    withUndoTxn(
        scene,
        `Create new ${args.rendOpts.rendererType} renderer`,
        () => {
            const rend = setupRenderer(
                ctx,
                obj as unknown as Record<string, unknown>,
                args.rendOpts,
            ) as Renderer | null;
            if (!rend) return;
            if (args.groupName) {
                try { rend.group = args.groupName; }
                catch (e) { console.warn('rend.group assign failed:', e); }
            }
            newRendId = (rend as unknown as { uid: number }).uid ?? -1;
            try { newName = rend.name ?? ''; } catch { newName = ''; }
        },
    );

    if (newRendId < 0) return { ok: false };
    return { ok: true, newRendId, newName };
}

export const services = {
    createRendererOnObject,
};
