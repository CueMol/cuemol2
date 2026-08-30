/**
 * @file worker/server/services/reassignProt2ndry.service.ts
 * @description Worker service backing the "Reassign secondary structure" tool
 * dialog (`dialog.tool.prot2ndry-tool`). Ports UXP `tools/prot2ndry-tool.js`
 * (`doRecalc` / `doAssign`):
 *   - recalc: MolAnlManager.calcProt2ndry2(mol, ignBulge, helixGapAngle)
 *     under a "Recalc protein secondary str" undo txn.
 *   - assign: MolAnlManager.setProt2ndry(mol, sel, secType) under an
 *     "Assign protein secondary str" undo txn.
 *
 * The molecule picker, mode, options, selection and type live client-side in
 * `ReassignProt2ndryDialog`; this service only performs the C++ mutation so it
 * can be wrapped in a single undo step (rollback on failure).
 */

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { MolAnlManager } from '@cuemol/core/src/wrappers/MolAnlManager';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

export interface ReassignProt2ndryArgs {
    sceneId: number;
    /** Target MolCoord object uid. */
    objId: number;
    /** 'recalc' = recompute from geometry, 'assign' = set a type on a selection. */
    mode: 'recalc' | 'assign';
    // recalc params
    /** Ignore beta bulge during recalculation. */
    ignBulge?: boolean;
    /** Helix gap-fill angle in degrees (0 disables gap-fill). */
    helixGapAngle?: number;
    // assign params
    /** Atom-selection expression (empty = all atoms). */
    selStr?: string;
    /** Secondary structure type: 0=coil, 1=strand, 2=helix, 3=helix3-10, 4=helix-pi. */
    secType?: number;
}

export interface ReassignProt2ndryResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false. */
    error?: string;
}

function reassignProt2ndry(
    ctx: WorkerContext,
    args: ReassignProt2ndryArgs,
): ReassignProt2ndryResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };

    const mol = scene.getObject(args.objId) as CueMolObject | null;
    if (!mol) return { ok: false, error: 'molecule not found' };

    const mgr = ctx.svc.getService('MolAnlManager') as MolAnlManager | null;
    if (!mgr) return { ok: false, error: 'MolAnlManager unavailable' };

    const m = mol as unknown as MolCoord;

    try {
        if (args.mode === 'recalc') {
            withUndoTxn(scene, 'Recalc protein secondary str', () => {
                mgr.calcProt2ndry2(m, args.ignBulge ?? false, args.helixGapAngle ?? 0);
            });
        } else {
            const sel = makeSel(ctx, args.selStr ?? '', scene.uid);
            if (!sel) return { ok: false, error: 'invalid selection' };
            withUndoTxn(scene, 'Assign protein secondary str', () => {
                mgr.setProt2ndry(m, sel as unknown as MolSelection, args.secType ?? 0);
            });
        }
    } catch (e) {
        return { ok: false, error: String(e) };
    }
    return { ok: true };
}

export const services = {
    reassignProt2ndry,
};
