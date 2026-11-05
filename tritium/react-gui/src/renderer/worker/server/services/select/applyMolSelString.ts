// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// MolStructPane toolbar backends:
//   - applyMolSelString: Select button -- assign a free-form selection
//     string to mol.sel under an undo txn (op `set_mol_selection`).
//   - selectAndFocusMol: Center / Zoom buttons -- the same, then move the
//     view to the new selection (op `focus_selection`), as one undo step.
//
// Mirrors UXP `onBtnSelCmd(nMode)` in
// `uxp_gui/cuemol2/base/content/molstruct-panel.js`:
//   nMode==0 -> Select
//   nMode==1 -> Center
//   nMode==2 -> Zoom

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { withUndoTxn } from '../withUndoTxn';
import { recordOp } from '@renderer/worker/server/actions/serviceOps';
import { focusMolSelection } from './focusMolSelection';

export interface ApplyMolSelStringArgs {
    sceneId: number;
    molId: number;
    /** UXP selection-string syntax (e.g. `"c;'A' | 'B'.10:20.*"`). Empty clears. */
    selStr: string;
}

export interface ApplyMolSelStringResult {
    ok: boolean;
}

export interface SelectAndFocusMolArgs {
    sceneId: number;
    viewId: number;
    molId: number;
    selStr: string;
    /** True fits the view to the selection; false only centres on it. */
    zoom: boolean;
}

export interface SelectAndFocusMolResult {
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

/** Set the selection and record it; the caller holds the undo txn. */
function setSelection(ctx: WorkerContext, mol: MolCoord, molId: number, selStr: string, sceneUid: number): boolean {
    if (!assignMolSel(ctx, mol, selStr, sceneUid)) return false;
    recordOp(ctx, sceneUid, 'set_mol_selection', { objId: molId, selection: selStr }, ['objId']);
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
        ok = setSelection(ctx, mol, args.molId, args.selStr, scene.uid);
    });
    return { ok };
}

/**
 * Set the selection, then fit the view to it (or centre on it): the
 * MolStruct pane's Center / Zoom. Recorded as `set_mol_selection` followed
 * by `focus_selection` on the same step. The selection stays set even when
 * it matches no atoms and the view cannot move.
 */
export function selectAndFocusMol(
    ctx: WorkerContext,
    args: SelectAndFocusMolArgs,
): SelectAndFocusMolResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const mol = scene.getObject(args.molId) as MolCoord | null;
    if (!mol) return { ok: false };

    let ok = false;
    withUndoTxn(scene, 'Change mol selection', () => {
        if (!setSelection(ctx, mol, args.molId, args.selStr, scene.uid)) return;
        ok = focusMolSelection(ctx, {
            sceneId: args.sceneId,
            viewId: args.viewId,
            molId: args.molId,
            selStr: null,
            zoom: args.zoom,
        }).ok;
    });
    return { ok };
}
