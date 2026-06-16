/**
 * @file services/changeChainName.service.ts
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
import type { MolAnlManager } from '@cuemol/core/src/wrappers/MolAnlManager';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull } from './helpers/sceneResolver';
import { makeSel } from './helpers/makeSel';
import { tryUndoTxn } from './withUndoTxn';

export interface ChangeChainNameArgs {
    sceneId: number;
    /** Target MolCoord object uid. */
    objId: number;
    /** Atom-selection expression (empty / "*" selects all atoms). */
    selStr: string;
    /** New chain ID to assign to the selected residues. */
    chainName: string;
}

export interface ChangeChainNameResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false. */
    error?: string;
}

function changeChainName(
    ctx: WorkerContext,
    args: ChangeChainNameArgs,
): ChangeChainNameResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };

    const mol = scene.getObject(args.objId) as CueMolObject | null;
    if (!mol) return { ok: false, error: 'molecule not found' };

    const sel = makeSel(ctx, args.selStr, scene.uid);
    if (!sel) return { ok: false, error: 'invalid selection' };

    const mgr = ctx.svc.getService('MolAnlManager') as MolAnlManager | null;
    if (!mgr) return { ok: false, error: 'MolAnlManager unavailable' };

    // changeChainName is a void mutation: success commits, a throw rolls back.
    return tryUndoTxn(scene, 'Change chain name', () => {
        mgr.changeChainName(
            mol as unknown as MolCoord,
            sel as unknown as MolSelection,
            args.chainName,
        );
    });
}

export const services = {
    changeChainName,
};
