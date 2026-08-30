/**
 * @file worker/server/services/cutSurfByPlane.service.ts
 * @description Worker service backing the "MolSurf cutting tool" dialog
 * (`dialog.tool.surf-cutbyplane`). Ports UXP `tools/surf-cutbyplane.js`
 * (`onDialogAccept`):
 *   - Derive the clipping plane from the current view: the front slab plane,
 *     normal = view direction (rotation^-1 applied to +Z), centre =
 *     view.center + normal * slab/2, then the normal is flipped.
 *   - Cut the target MolSurfObj with `cutByPlane2(density, normal, center,
 *     keepBody, keepSection)`, with the body/section flags chosen by mode.
 *   - In "separate" mode the surface is cloned (via StreamManager XML round
 *     trip) so the body and the cross-section become two objects.
 *   - All mutations run inside a single "Cut surface by plane" undo txn.
 *
 * The surface picker, mode selector and density input live client-side in
 * `CutSurfByPlaneDialog`; this service performs the C++ geometry so it can be
 * wrapped in one undo step.
 */

import type { Vector } from '@cuemol/core/src/wrappers/Vector';
import type { MolSurfObj } from '@cuemol/core/src/wrappers/MolSurfObj';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { LScrObject } from '@cuemol/core/src/wrappers/LScrObject';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull, getViewOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { withUndoTxn } from './withUndoTxn';

/** Cross-section cutting mode (UXP `cuttype-list` values). */
export type CutSurfMode = 'full' | 'separate' | 'sect' | 'body';

export interface CutSurfByPlaneArgs {
    sceneId: number;
    viewId: number;
    /** Target MolSurfObj object uid. */
    objId: number;
    /** Cross-section mode. */
    mode: CutSurfMode;
    /** Section mesh density (/A); coerced to >= 0.1 (default 5.0). */
    density: number;
}

export interface CutSurfByPlaneResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false. */
    error?: string;
    /** UID of the new section object when mode === 'separate'. */
    sectObjId?: number;
}

/**
 * Pick the first available name from `sect_<base>`, `sect1_<base>`, ... --
 * mirrors UXP `util.makeUniqName2(a => "sect"+a+"_"+name, ...)`.
 */
function uniqSectName(base: string, exists: (name: string) => boolean): string {
    if (!exists(`sect_${base}`)) return `sect_${base}`;
    for (let i = 1; i < 10000; i++) {
        const candidate = `sect${i}_${base}`;
        if (!exists(candidate)) return candidate;
    }
    return `sect_${base}`;
}

/** Map the cutting mode to the (keepBody, keepSection) flags (UXP parity). */
function modeFlags(mode: CutSurfMode): { body: boolean; sect: boolean } {
    switch (mode) {
        case 'sect':
            return { body: false, sect: true };
        case 'body':
            return { body: true, sect: false };
        case 'full':
        case 'separate':
        default:
            return { body: true, sect: true };
    }
}

function cutSurfByPlane(
    ctx: WorkerContext,
    args: CutSurfByPlaneArgs,
): CutSurfByPlaneResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };
    const view = getViewOrNull(ctx, args.viewId) as GUIView | null;
    if (!view) return { ok: false, error: 'view not found' };

    const tgt = scene.getObject(args.objId) as MolSurfObj | null;
    if (!tgt) return { ok: false, error: 'surface object not found' };

    let density = args.density;
    if (!Number.isFinite(density) || density < 0.1) density = 5.0;

    // Derive the clipping plane from the current view (UXP onDialogAccept).
    // normal = (view.rotation^-1) * (+Z); center = view.center + normal*(slab/2);
    // then the normal is flipped to point into the kept half-space.
    const slab = (view as unknown as { slab: number }).slab;
    const rotmat = (view as unknown as { rotation: { conjugate: () => { toMatrix: () => { mulvec: (v: Vector) => Vector } } } })
        .rotation.conjugate().toMatrix();

    let normal = ctx.svc.createObj('Vector') as Vector;
    (normal as unknown as { set4: (a: number, b: number, c: number, d: number) => void })
        .set4(0, 0, 1, 0);
    normal = rotmat.mulvec(normal);

    const viewCenter = (view as unknown as { center: Vector }).center;
    const center = (viewCenter as unknown as { add: (v: Vector) => Vector })
        .add((normal as unknown as { scale: (s: number) => Vector }).scale(slab / 2.0));
    normal = (normal as unknown as { scale: (s: number) => Vector }).scale(-1.0);

    const { body, sect } = modeFlags(args.mode);

    // Pre-clone the surface for "separate" mode (outside the txn, like UXP).
    let sectObj: MolSurfObj | null = null;
    let sectName = '';
    if (args.mode === 'separate') {
        const xml = ctx.strMgr.toXML(tgt as unknown as LScrObject);
        if (!xml) return { ok: false, error: 'failed to clone surface' };
        sectObj = ctx.strMgr.fromXML(xml, scene.uid) as unknown as MolSurfObj | null;
        if (!sectObj) return { ok: false, error: 'failed to clone surface' };
        const baseName = (tgt as unknown as { name: string }).name;
        sectName = uniqSectName(baseName, (n) => !!scene.getObjectByName(n));
    }

    let sectObjId = -1;
    try {
        withUndoTxn(scene, 'Cut surface by plane', () => {
            if (args.mode === 'separate' && sectObj) {
                (sectObj as unknown as { name: string }).name = sectName;
                scene.addObject(sectObj as unknown as CueMolObject);
                sectObjId = (sectObj as unknown as { uid: number }).uid;
                // section object keeps only the cross-section; body keeps body.
                sectObj.cutByPlane2(density, normal, center, false, true);
                tgt.cutByPlane2(density, normal, center, true, false);
            } else {
                tgt.cutByPlane2(density, normal, center, body, sect);
            }
        });
    } catch (e) {
        return { ok: false, error: String(e) };
    }

    return args.mode === 'separate'
        ? { ok: true, sectObjId }
        : { ok: true };
}

export const services = {
    cutSurfByPlane,
};
