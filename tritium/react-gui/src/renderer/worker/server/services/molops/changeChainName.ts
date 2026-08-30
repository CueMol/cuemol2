/**
 * @file worker/server/services/changeChainName.service.ts
 * @description Worker service backing the "Change chain ID" tool dialog
 * (`dialog.tool.chg-chname`). Ports UXP `tools/chg_chname.js`
 * (`gChgChnmDlg.onDialogAccept`):
 *   - Compile the atom selection string against the target molecule.
 *   - Call `MolAnlManager.changeChainName(mol, sel, name)` under an undo txn.
 *
 * The molecule picker and selection-string editing live client-side in
 * `ChangeChainIdDialog` (via `ObjectSelect` + `MolSelList`); this service
 * only performs the C++ mutation so it can be wrapped in a single undo step.
 */

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { resolveMolTool } from '@renderer/worker/server/services/helpers/molAnlTool';
import { undoTxnResult } from '../withUndoTxn';
import { ok, type Result } from '@renderer/worker/shared/result';

export interface ChangeChainNameArgs {
    sceneId: number;
    /** Target MolCoord object uid. */
    objId: number;
    /** Atom-selection expression (empty / "*" selects all atoms). */
    selStr: string;
    /** New chain ID to assign to the selected residues. */
    chainName: string;
}

export type ChangeChainNameResult = Result;

export function changeChainName(
    ctx: WorkerContext,
    args: ChangeChainNameArgs,
): ChangeChainNameResult {
    const t = resolveMolTool(ctx, args.sceneId, args.objId, args.selStr);
    if ('ok' in t) return t;
    const { scene, mol, sel, mgr } = t;

    // changeChainName is a void mutation: success commits, a throw rolls back.
    return undoTxnResult(scene, 'Change chain name', () => {
        mgr.changeChainName(
            mol as unknown as MolCoord,
            sel as unknown as MolSelection,
            args.chainName,
        );
        return ok();
    });
}
