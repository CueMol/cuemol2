/**
 * @file services/mergeMol.service.ts
 * @description Worker service backing the "Merge molecule" tool dialog
 * (`dialog.tool.mol-merge`). Ports UXP `tools/mol_merge.js`
 * (`gMolMrgDlg.onDialogAccept`):
 *   - Compile the source atom selection.
 *   - Copy the selected atoms from the source molecule into the destination
 *     via `MolAnlManager.copyAtoms(toMol, fromMol, sel)`.
 *   - When "Copy" is off (move), delete the selected atoms from the source via
 *     `MolAnlManager.deleteAtoms(fromMol, sel)`.
 *
 * Both steps run in a single "Merge molecule" undo txn. Unlike the single-call
 * tool services, the multi-step move must roll back as a whole: errors (or a
 * `false` return) propagate out of the txn callback so `withUndoTxn` rolls back
 * the copy too, preventing a half-merged duplicate.
 */

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { MolAnlManager } from '@cuemol/core/src/wrappers/MolAnlManager';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

export interface MergeMolArgs {
    sceneId: number;
    /** Source MolCoord object uid (atoms come from here). */
    fromObjId: number;
    /** Destination MolCoord object uid (atoms go here). */
    toObjId: number;
    /** Atom-selection expression against the source molecule. */
    selStr: string;
    /** true = copy (keep source atoms), false = move (delete from source). */
    copy: boolean;
}

export interface MergeMolResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false. */
    error?: string;
}

function mergeMol(ctx: WorkerContext, args: MergeMolArgs): MergeMolResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };

    if (args.fromObjId === args.toObjId) {
        return { ok: false, error: 'source and destination must differ' };
    }

    const fromMol = scene.getObject(args.fromObjId) as CueMolObject | null;
    if (!fromMol) return { ok: false, error: 'source molecule not found' };
    const toMol = scene.getObject(args.toObjId) as CueMolObject | null;
    if (!toMol) return { ok: false, error: 'destination molecule not found' };

    const sel = makeSel(ctx, args.selStr, scene.uid);
    if (!sel) return { ok: false, error: 'invalid selection' };

    const mgr = ctx.svc.getService('MolAnlManager') as MolAnlManager | null;
    if (!mgr) return { ok: false, error: 'MolAnlManager unavailable' };

    const from = fromMol as unknown as MolCoord;
    const to = toMol as unknown as MolCoord;
    const s = sel as unknown as MolSelection;

    try {
        withUndoTxn(scene, 'Merge molecule', () => {
            // copyAtoms(destination, source, selection)
            if (!mgr.copyAtoms(to, from, s)) {
                throw new Error('copyAtoms failed');
            }
            if (!args.copy) {
                if (!mgr.deleteAtoms(from, s)) {
                    throw new Error('deleteAtoms failed');
                }
            }
        });
    } catch (e) {
        return { ok: false, error: String(e) };
    }
    return { ok: true };
}

export const services = {
    mergeMol,
};
