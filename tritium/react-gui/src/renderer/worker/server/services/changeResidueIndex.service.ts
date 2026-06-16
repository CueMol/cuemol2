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
import type { WorkerContext } from '../types/WorkerContext';
import { resolveMolTool } from './helpers/molAnlTool';
import { tryUndoTxn } from './withUndoTxn';

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
    const t = resolveMolTool(ctx, args.sceneId, args.objId, args.selStr);
    if ('ok' in t) return t;
    const { scene, mol, sel, mgr } = t;

    // renumResIndex / shiftResIndex return a boolean success flag:
    // false -> rollback (no commit).
    return tryUndoTxn(scene, 'Change residue index', () => {
        const m = mol as unknown as MolCoord;
        const s = sel as unknown as MolSelection;
        return args.renumber
            ? mgr.renumResIndex(m, s, args.bshift, args.value)
            : mgr.shiftResIndex(m, s, args.bshift, args.value);
    });
}

export const services = {
    changeResidueIndex,
};
