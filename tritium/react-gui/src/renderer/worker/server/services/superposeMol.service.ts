/**
 * @file services/superposeMol.service.ts
 * @description Worker service backing the "Molecular superposition" tool
 * dialog. Ports UXP `tools/ssm_sup.js` (`gSSMSupDlg.onDialogAccept`):
 *   - Compile the reference / moving atom-selection strings.
 *   - Call `MolAnlManager.superposeSSM1` or `superposeLSQ1` under an undo txn
 *     (rolling back the whole superposition on failure).
 *   - Optionally recenter the active view onto the moving selection
 *     (`MolCoord.fitView2`), matching the UXP "Auto recenter" checkbox.
 *
 * The molecule pickers and selection-string editing live client-side in
 * `MolSuperposeDialog` (via `ObjectSelect` + `MolSelList`); this service only
 * performs the C++ mutation so it can be wrapped in a single undo step.
 *
 * The UXP "Write RMSD info file" feature (LSQ-only `calcRMSD` to a file) is
 * intentionally not ported yet -- it needs a native save dialog. See the
 * superposition ADR for the deferral.
 */

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { MolAnlManager } from '@cuemol/core/src/wrappers/MolAnlManager';
import type { View } from '@cuemol/core/src/wrappers/View';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull, getViewOrNull } from './helpers/sceneResolver';
import { makeSel } from './helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

/** Superposition algorithm: least-squares fit or secondary-structure matching. */
export type SuperposeAlgo = 'LSQ' | 'SSM';

export interface SuperposeMolArgs {
    sceneId: number;
    /** Active view uid; only used when `autoRecenter` is set. */
    viewId: number;
    algo: SuperposeAlgo;
    /** Reference MolCoord uid (stays fixed). */
    refObjId: number;
    /** Reference atom-selection expression (empty / "*" selects all atoms). */
    refSel: string;
    /** Moving MolCoord uid (transformed onto the reference). */
    movObjId: number;
    /** Moving atom-selection expression. */
    movSel: string;
    /** Store the transform in the `xformMat` property instead of applying it. */
    useprop: boolean;
    /** Fit the active view onto the moving selection after superposition. */
    autoRecenter: boolean;
}

export interface SuperposeMolResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false. */
    error?: string;
}

/**
 * `fitView2` lives on MolCoord but not on every Object subclass at the C++
 * layer; probe before calling so a missing-method case is skipped cleanly
 * rather than crashing the worker (matches UXP `'fitView2' in target`).
 */
function tryFitView2(mol: MolCoord, view: View, sel: MolSelection): void {
    const fn = (mol as unknown as { fitView2?: unknown }).fitView2;
    if (typeof fn !== 'function') return;
    try {
        mol.fitView2(view, sel);
    } catch {
        // Recenter is a convenience; ignore failures so the superposition
        // result (already committed) still reports success.
    }
}

export function superposeMol(
    ctx: WorkerContext,
    args: SuperposeMolArgs,
): SuperposeMolResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };

    const refMol = scene.getObject(args.refObjId) as CueMolObject | null;
    if (!refMol) return { ok: false, error: 'reference molecule not found' };
    const movMol = scene.getObject(args.movObjId) as CueMolObject | null;
    if (!movMol) return { ok: false, error: 'moving molecule not found' };

    const refSel = makeSel(ctx, args.refSel, scene.uid);
    if (!refSel) return { ok: false, error: 'invalid reference selection' };
    const movSel = makeSel(ctx, args.movSel, scene.uid);
    if (!movSel) return { ok: false, error: 'invalid moving selection' };

    const mgr = ctx.svc.getService('MolAnlManager') as MolAnlManager | null;
    if (!mgr) return { ok: false, error: 'MolAnlManager unavailable' };

    const ref = refMol as unknown as MolCoord;
    const mov = movMol as unknown as MolCoord;
    const rsel = refSel as unknown as MolSelection;
    const msel = movSel as unknown as MolSelection;

    // Let the exception propagate out of withUndoTxn so the whole
    // superposition is rolled back (UXP `rollbackUndoTxn` on failure).
    try {
        withUndoTxn(scene, 'Mol superpose', () => {
            if (args.algo === 'SSM') {
                mgr.superposeSSM1(ref, rsel, mov, msel, args.useprop);
            } else {
                mgr.superposeLSQ1(ref, rsel, mov, msel, args.useprop);
            }
        });
    } catch (e) {
        return { ok: false, error: String(e) };
    }

    if (args.autoRecenter) {
        const view = getViewOrNull(ctx, args.viewId);
        if (view) tryFitView2(mov, view as unknown as View, msel);
    }

    return { ok: true };
}

export const services = {
    superposeMol,
};
