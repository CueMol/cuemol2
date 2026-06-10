/**
 * @file services/changeResidueIndex.service.ts
 * @description Worker service backing the "Change residue index" tool dialog
 * (`dialog.tool.chg-resindex`). Ports UXP `tools/chg_resindex.js`
 * (`gChgResIndDlg.onDialogAccept`):
 *   - Compile the atom selection string against the target molecule.
 *   - Call `MolAnlManager.renumResIndex` (when renumber is on) or
 *     `shiftResIndex` (off) with the shift/start flag and value, under an
 *     undo txn.
 *
 * The molecule picker, selection, mode (shift/start), value and renumber flag
 * live client-side in `ChangeResidueIndexDialog`; this service only performs
 * the C++ mutation so it can be wrapped in a single undo step.
 */

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { MolAnlManager } from '@cuemol/core/src/wrappers/MolAnlManager';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull } from './helpers/sceneResolver';
import { makeSel } from './helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

export interface ChangeResidueIndexArgs {
    sceneId: number;
    /** Target MolCoord object uid. */
    objId: number;
    /** Atom-selection expression (empty selects all residues). */
    selStr: string;
    /** true = "Shift by" (relative), false = "Start from" (absolute). */
    bshift: boolean;
    /** Shift delta (shift mode) or start number (start mode). */
    value: number;
    /** true = renumber (renumResIndex), false = shift (shiftResIndex). */
    renumber: boolean;
}

export interface ChangeResidueIndexResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false. */
    error?: string;
}

function changeResidueIndex(
    ctx: WorkerContext,
    args: ChangeResidueIndexArgs,
): ChangeResidueIndexResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };

    const mol = scene.getObject(args.objId) as CueMolObject | null;
    if (!mol) return { ok: false, error: 'molecule not found' };

    const sel = makeSel(ctx, args.selStr, scene.uid);
    if (!sel) return { ok: false, error: 'invalid selection' };

    const mgr = ctx.svc.getService('MolAnlManager') as MolAnlManager | null;
    if (!mgr) return { ok: false, error: 'MolAnlManager unavailable' };

    let err: string | null = null;
    let ok = false;
    withUndoTxn(scene, 'Change residue index', () => {
        try {
            const m = mol as unknown as MolCoord;
            const s = sel as unknown as MolSelection;
            ok = args.renumber
                ? mgr.renumResIndex(m, s, args.bshift, args.value)
                : mgr.shiftResIndex(m, s, args.bshift, args.value);
        } catch (e) {
            err = String(e);
        }
    });
    if (err !== null) return { ok: false, error: err };
    if (!ok) return { ok: false, error: 'changeResidueIndex failed' };
    return { ok: true };
}

export const services = {
    changeResidueIndex,
};
