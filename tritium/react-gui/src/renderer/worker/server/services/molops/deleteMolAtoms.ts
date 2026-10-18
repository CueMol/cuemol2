/**
 * @file worker/server/services/deleteMolAtoms.service.ts
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
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { resolveMolTool } from '@renderer/worker/server/services/molops/molAnlTool';
import { undoTxnResult } from '../withUndoTxn';
import { recordOp } from '@renderer/worker/server/actions/serviceOps';
import { ok, fail, type Result } from '@renderer/worker/shared/result';

export interface DeleteMolAtomsArgs {
    sceneId: number;
    /** Target MolCoord object uid. */
    objId: number;
    /** Atom-selection expression of the atoms to delete. */
    selStr: string;
}

export type DeleteMolAtomsResult = Result;

export function deleteMolAtoms(
    ctx: WorkerContext,
    args: DeleteMolAtomsArgs,
): DeleteMolAtomsResult {
    const t = resolveMolTool(ctx, args.sceneId, args.objId, args.selStr);
    if ('ok' in t) return t;
    const { scene, mol, sel, mgr } = t;

    // deleteAtoms returns a boolean success flag: false -> rollback (no commit).
    return undoTxnResult(scene, 'Delete atoms', () => {
        // delete_atoms refuses an empty selection (it would delete every atom).
        if (args.selStr.trim() !== '') {
            recordOp(ctx, scene.uid, 'delete_atoms', { objId: args.objId, selection: args.selStr }, ['objId']);
        }
        return mgr.deleteAtoms(
            mol as unknown as MolCoord,
            sel as unknown as MolSelection,
        )
            ? ok()
            : fail('atom deletion was rejected', 'native');
    });
}
