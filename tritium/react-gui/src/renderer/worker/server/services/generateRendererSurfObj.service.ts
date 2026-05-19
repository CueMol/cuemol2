// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Phase: panel.workspace.ctxmenu.renderer — "Generate surface obj" item
// (isosurf renderer only).
//
// Mirrors UXP `ws.onGenSurfObj` in `workspace_panel_ctxtmenu.js`.
// The isosurf MapSurfRenderer exposes `generateSurfObj()` which returns
// a new MolSurfObj precomputed from the current contour. This service
// adds that object to the scene, attaches a fresh molsurf renderer, and
// transfers the source renderer's color setup so the new surface looks
// visually consistent with the contour it was generated from.

import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { MapSurfRenderer } from '@cuemol/core/src/wrappers/MapSurfRenderer';
import type { MolSurfRenderer } from '@cuemol/core/src/wrappers/MolSurfRenderer';
import type { WorkerContext } from '../types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';

export interface GenerateRendererSurfObjArgs {
    sceneId: number;
    rendId: number;
}

export interface GenerateRendererSurfObjResult {
    ok: boolean;
    /** UID of the new MolSurfObj on success. */
    newObjId?: number;
    /** UID of the molsurf renderer attached to the new object. */
    newRendId?: number;
    /** Resolved unique name of the new object (for downstream UI). */
    newObjName?: string;
}

function getTypeName(rend: Renderer): string {
    try {
        return (rend as unknown as { type_name: string }).type_name ?? '';
    } catch {
        return '';
    }
}

/**
 * Pick the first available name from the sequence `${prefix}`, `${prefix}1`,
 * `${prefix}2`, ... — matches UXP `util.makeUniqName2` start-from-empty
 * convention used by `onGenSurfObj`.
 */
function uniqName(prefix: string, exists: (name: string) => boolean): string {
    if (!exists(prefix)) return prefix;
    for (let i = 1; i < 10000; i++) {
        const candidate = `${prefix}${i}`;
        if (!exists(candidate)) return candidate;
    }
    return `${prefix}${Date.now()}`;
}

function getColormode(rend: Renderer): string {
    try {
        // enum-typed property: returned as string at runtime per CueMol qif.
        return (rend as unknown as { colormode: unknown }).colormode as string;
    } catch {
        return '';
    }
}

function transferColorSetup(src: Renderer, dst: Renderer): void {
    const srcAny = src as unknown as MapSurfRenderer;
    const dstAny = dst as unknown as MolSurfRenderer;
    if (getColormode(src) === 'multigrad') {
        // multigrad: copy the gradient + the elepot/color map name.
        (dstAny as unknown as { colormode: unknown }).colormode =
            'multigrad' as unknown as number;
        try {
            dstAny.multi_grad.copyFrom(srcAny.multi_grad);
        } catch {
            // multi_grad may not be readable on some configurations — skip.
        }
        try {
            dstAny.elepot = srcAny.color_mapname ?? '';
        } catch {
            // best-effort; default elepot stays.
        }
    } else {
        // solid / molecule / other: take the renderer's defaultcolor.
        try {
            dstAny.defaultcolor = srcAny.defaultcolor;
        } catch {
            // best-effort.
        }
    }
}

function generateRendererSurfObj(
    ctx: WorkerContext,
    args: GenerateRendererSurfObjArgs,
): GenerateRendererSurfObjResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { ok: false };
    if (getTypeName(rend) !== 'isosurf') return { ok: false };

    const srcMol = rend.getClientObj() as CueMolObject | null;
    if (!srcMol) return { ok: false };

    let newObjName = '';
    let newRendName = '';
    let newObjId = -1;
    let newRendId = -1;

    withUndoTxn(scene, 'Generate surfobj', () => {
        const newObj = (rend as unknown as MapSurfRenderer)
            .generateSurfObj() as CueMolObject;
        if (!newObj) return;

        newObjName = uniqName(
            `${srcMol.name}_sf`,
            (n) => !!scene.getObjectByName(n),
        );
        newObj.name = newObjName;
        scene.addObject(newObj);
        newObjId = (newObj as unknown as { uid: number }).uid;

        const newRend = newObj.createRenderer('molsurf') as unknown as Renderer;
        newRendName = uniqName(
            'molsurf',
            (n) => !!scene.getRendByName(n),
        );
        newRend.name = newRendName;
        newRendId = (newRend as unknown as { uid: number }).uid;

        transferColorSetup(rend, newRend);
    });

    if (newObjId < 0) return { ok: false };
    return { ok: true, newObjId, newRendId, newObjName };
}

export const services = {
    generateRendererSurfObj,
};
