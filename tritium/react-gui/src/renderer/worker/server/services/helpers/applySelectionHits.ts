/**
 * @file services/helpers/applySelectionHits.ts
 * @description Shared tail for the rectangle / lasso selection services.
 *
 * Both `rectSelect` (View.hitTestRect) and `lassoSelect` (View.hitTestPolygon)
 * produce the same hit-test JSON -- an array of `{ obj_id, sel }`. Given that,
 * this helper groups the hits by molecule object, replaces (or, for
 * `mode:'add'`, ORs) each molecule's selection with the union of its hit `sel`
 * strings, auto-creates the `*selection` renderer, and wraps the whole update
 * in a single undo transaction. Runs in the Web Worker thread (C++ wrappers are
 * synchronous).
 *
 * @module applySelectionHits
 */

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { makeSel } from './makeSel';
import { withUndoTxn } from '@renderer/worker/server/services/withUndoTxn';

/** One element of a hit-test JSON array (View.hitTestRect / hitTestPolygon). */
export interface SelectionHit {
    obj_id: number;
    sel: string;
}

export interface SelectionResult {
    ok: boolean;
    /** Object ids whose selection was updated. */
    selectedObjIds: number[];
}

/**
 * Parse a hit-test JSON string into hit entries. Returns `[]` on empty /
 * unparsable input (the caller then reports `ok:false`).
 */
export function parseSelectionHits(json: string | null | undefined): SelectionHit[] {
    if (!json) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
        (h): h is SelectionHit =>
            h != null && typeof h.obj_id === 'number' && typeof h.sel === 'string',
    );
}

/** Assign `selStr` to `mol.sel`, auto-creating the `*selection` renderer. */
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
 * Apply hit-test results to the scene's selections. Groups by `obj_id` (UXP
 * rectSel parity), then replaces or (when `mode:'add'`) ORs each molecule's
 * selection, inside one undo transaction.
 *
 * @returns `ok` and the object ids whose selection was updated.
 */
export function applySelectionHits(
    ctx: WorkerContext,
    scene: Scene,
    hits: SelectionHit[],
    mode: 'replace' | 'add' | undefined,
): SelectionResult {
    const selByObj = new Map<number, string[]>();
    for (const hit of hits) {
        const list = selByObj.get(hit.obj_id) ?? [];
        list.push(hit.sel);
        selByObj.set(hit.obj_id, list);
    }
    if (selByObj.size === 0) return { ok: false, selectedObjIds: [] };

    const addMode = mode === 'add';
    const selectedObjIds: number[] = [];
    withUndoTxn(scene, addMode ? 'Add select atom(s)' : 'Select atom(s)', () => {
        for (const [objId, selStrs] of selByObj) {
            const mol = scene.getObject(objId) as MolCoord | null;
            if (!mol) continue;
            const newSelStr = selStrs.join('|');
            let selStr = newSelStr;
            if (addMode) {
                // OR the new hits with the molecule's current selection.
                const prevSelStr = mol.sel.toString();
                if (prevSelStr) selStr = `(${prevSelStr}) or (${newSelStr})`;
            }
            if (assignMolSel(ctx, mol, selStr, scene.uid)) {
                selectedObjIds.push(objId);
            }
        }
    });

    return { ok: selectedObjIds.length > 0, selectedObjIds };
}
