/**
 * @file services/deleteMolAtoms.service.ts
 * @description Worker service backing the "Delete atoms" tool dialog
 * (`dialog.tool.mol-delete`). Ports UXP `tools/mol_delete.js`
 * (`gMolDelDlg.onDialogAccept`):
 *   - Compile the atom selection string against the target molecule.
 *   - Call `MolAnlManager.deleteAtoms(mol, sel)` under an undo txn.
 *
 * The molecule picker and selection-string editing live client-side in
 * `DeleteMolDialog` (via `ObjectSelect` + `MolSelList`); this service only
 * performs the C++ mutation so it can be wrapped in a single undo step.
 */

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { MolAnlManager } from '@cuemol/core/src/wrappers/MolAnlManager';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull } from './helpers/sceneResolver';
import { makeSel } from './helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

export interface DeleteMolAtomsArgs {
    sceneId: number;
    /** Target MolCoord object uid. */
    objId: number;
    /** Atom-selection expression of the atoms to delete. */
    selStr: string;
}

export interface DeleteMolAtomsResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false. */
    error?: string;
}

function deleteMolAtoms(
    ctx: WorkerContext,
    args: DeleteMolAtomsArgs,
): DeleteMolAtomsResult {
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
    withUndoTxn(scene, 'Delete atoms', () => {
        try {
            ok = mgr.deleteAtoms(
                mol as unknown as MolCoord,
                sel as unknown as MolSelection,
            );
        } catch (e) {
            err = String(e);
        }
    });
    if (err !== null) return { ok: false, error: err };
    if (!ok) return { ok: false, error: 'deleteAtoms failed' };
    return { ok: true };
}

export const services = {
    deleteMolAtoms,
};
