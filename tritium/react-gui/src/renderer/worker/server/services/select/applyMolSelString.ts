// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// MolStructPane toolbar backends:
//   - applyMolSelString: Select button -- assign a free-form selection
//     string to mol.sel under an undo txn.
//   - centerMolSelection: Center button -- apply selection, then move the
//     view center to the selection centroid.
//   - zoomMolSelection: Zoom button -- apply selection, then fit the view
//     to it.
//
// Mirrors UXP `onBtnSelCmd(nMode)` in
// `uxp_gui/cuemol2/base/content/molstruct-panel.js`:
//   nMode==0 -> Select
//   nMode==1 -> Center
//   nMode==2 -> Zoom

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { View } from '@cuemol/core/src/wrappers/View';
import type { Vector } from '@cuemol/core/src/wrappers/Vector';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull, getViewSceneObjOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { withUndoTxn } from '../withUndoTxn';

export interface ApplyMolSelStringArgs {
    sceneId: number;
    molId: number;
    /** UXP selection-string syntax (e.g. `"c;'A' | 'B'.10:20.*"`). Empty clears. */
    selStr: string;
}

export interface ApplyMolSelStringResult {
    ok: boolean;
}

export interface CenterMolSelectionArgs {
    sceneId: number;
    viewId: number;
    molId: number;
    selStr: string;
}

export interface CenterMolSelectionResult {
    ok: boolean;
}

export interface ZoomMolSelectionArgs {
    sceneId: number;
    viewId: number;
    molId: number;
    selStr: string;
}

export interface ZoomMolSelectionResult {
    ok: boolean;
}

/**
 * Apply `selStr` to `mol.sel` and ensure the `*selection` renderer exists
 * so the change is visible. Returns false when the selection-string fails
 * to compile.
 */
function assignMolSel(
    ctx: WorkerContext,
    mol: MolCoord,
    selStr: string,
    sceneUid: number,
): boolean {
    const sel = makeSel(ctx, selStr, sceneUid);
    if (sel === null) return false;
    if (!mol.getRendererByType('*selection')) {
        mol.createRenderer('*selection');
    }
    mol.sel = sel;
    return true;
}

export function applyMolSelString(
    ctx: WorkerContext,
    args: ApplyMolSelStringArgs,
): ApplyMolSelStringResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const mol = scene.getObject(args.molId) as MolCoord | null;
    if (!mol) return { ok: false };

    let ok = false;
    withUndoTxn(scene, 'Change mol selection', () => {
        ok = assignMolSel(ctx, mol, args.selStr, scene.uid);
    });
    return { ok };
}

/**
 * Probe `mol.getCenterPos(true)` defensively -- it can throw on objects
 * with no atoms / unrecognised selection, in which case we skip the
 * view-center update rather than letting the exception escape.
 */
function safeGetSelectionCenter(mol: MolCoord): Vector | null {
    try {
        const pos = mol.getCenterPos(true);
        return pos ?? null;
    } catch {
        return null;
    }
}

export function centerMolSelection(
    ctx: WorkerContext,
    args: CenterMolSelectionArgs,
): CenterMolSelectionResult {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.molId);
    if (!vsm) return { ok: false };
    if (vsm.scene.uid !== args.sceneId) return { ok: false };

    let ok = false;
    withUndoTxn(vsm.scene, 'Center on mol selection', () => {
        if (!assignMolSel(ctx, vsm.obj, args.selStr, vsm.scene.uid)) return;
        const pos = safeGetSelectionCenter(vsm.obj);
        if (!pos) return;
        vsm.view.setViewCenter(pos);
        ok = true;
    });
    return { ok };
}

/**
 * `fitView` lives on MolCoord but not on every subclass at the C++ layer;
 * probe before calling so a missing-method case fails the service cleanly
 * instead of crashing the worker.
 */
function tryFitView(mol: MolCoord, view: View): boolean {
    const fn = (mol as unknown as { fitView?: (v: unknown, b: boolean) => void }).fitView;
    if (typeof fn !== 'function') return false;
    try {
        mol.fitView(view, true);
        return true;
    } catch {
        return false;
    }
}

export function zoomMolSelection(
    ctx: WorkerContext,
    args: ZoomMolSelectionArgs,
): ZoomMolSelectionResult {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.molId);
    if (!vsm) return { ok: false };
    if (vsm.scene.uid !== args.sceneId) return { ok: false };

    let ok = false;
    withUndoTxn(vsm.scene, 'Zoom to mol selection', () => {
        if (!assignMolSel(ctx, vsm.obj, args.selStr, vsm.scene.uid)) return;
        ok = tryFitView(vsm.obj, vsm.view);
    });
    return { ok };
}
