// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Rectangle (rubber-band) selection backend. Mirrors UXP
// `navi-toolribbon.js` rectSel(): hit-test the dragged rectangle, group the
// hits by molecule object, and replace each molecule's selection with the
// union of the matched atoms.

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { WorkerContext } from '../types/WorkerContext';
import { getViewSceneOrNull } from './helpers/sceneResolver';
import { makeSel } from './helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

export interface RectSelectArgs {
    viewId: number;
    /** Rectangle bounds in canvas-local logical pixels (same space as hitTest). */
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface RectSelectResult {
    ok: boolean;
    /** Object ids whose selection was updated. */
    selectedObjIds: number[];
}

/** One element of the `View.hitTestRect` JSON array (multi-hit shape). */
interface RectHit {
    obj_id: number;
    sel: string;
}

/**
 * Assign `selStr` to `mol.sel`, auto-creating the `*selection` renderer so
 * the change is visible. Returns false when the selection string fails to
 * compile. Mirrors `assignMolSel` in applyMolSelString.service.ts.
 */
function assignMolSel(ctx: WorkerContext, mol: MolCoord, selStr: string, sceneUid: number): boolean {
    const sel = makeSel(ctx, selStr, sceneUid);
    if (sel === null) return false;
    if (!mol.getRendererByType('*selection')) {
        mol.createRenderer('*selection');
    }
    mol.sel = sel;
    return true;
}

/**
 * Hit-test the dragged rectangle and replace the selection of each matched
 * molecule. `bNearest=false` returns every hit inside the rectangle.
 */
function rectSelect(ctx: WorkerContext, args: RectSelectArgs): RectSelectResult {
    const vs = getViewSceneOrNull(ctx, args.viewId);
    if (!vs) return { ok: false, selectedObjIds: [] };
    const { view, scene } = vs;

    const sres = view.hitTestRect(args.left, args.top, args.width, args.height, false);
    if (!sres) return { ok: false, selectedObjIds: [] };

    let hits: RectHit[];
    try {
        hits = JSON.parse(sres) as RectHit[];
    } catch {
        return { ok: false, selectedObjIds: [] };
    }
    if (!Array.isArray(hits) || hits.length === 0) {
        return { ok: false, selectedObjIds: [] };
    }

    // Group selection strings by molecule object id (UXP rectSel parity).
    const selByObj = new Map<number, string[]>();
    for (const hit of hits) {
        if (hit.obj_id == null || hit.sel == null) continue;
        const list = selByObj.get(hit.obj_id) ?? [];
        list.push(hit.sel);
        selByObj.set(hit.obj_id, list);
    }
    if (selByObj.size === 0) return { ok: false, selectedObjIds: [] };

    const selectedObjIds: number[] = [];
    withUndoTxn(scene, 'Select atom(s)', () => {
        for (const [objId, selStrs] of selByObj) {
            const mol = scene.getObject(objId) as MolCoord | null;
            if (!mol) continue;
            if (assignMolSel(ctx, mol, selStrs.join('|'), scene.uid)) {
                selectedObjIds.push(objId);
            }
        }
    });

    return { ok: selectedObjIds.length > 0, selectedObjIds };
}

export const services = {
    rectSelect,
};
