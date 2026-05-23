// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Apply an explicit selection-string to a MolCoord's `sel` property under
// an undo txn. Used by MolStructPane's Select toolbar button.
//
// Mirrors UXP `cuemolui.chgMolSel(mol, selstr, "Change mol selection",
// true)` from `molstruct-panel.js` `onBtnSelCmd`.
//
// Distinct from `selectObjectMol.service.ts`, which dispatches a fixed
// set of named kinds (all / invert / protein / around-N / ...). This
// service takes a free-form selection string already composed on the
// renderer side by `selStrFromTree`.

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull } from './helpers/sceneResolver';
import { makeSel } from './helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

export interface ApplyMolSelStringArgs {
    sceneId: number;
    molId: number;
    /** UXP selection-string syntax (e.g. `"c;'A' | 'B'.10:20.*"`). Empty clears. */
    selStr: string;
}

export interface ApplyMolSelStringResult {
    ok: boolean;
}

function applyMolSelString(
    ctx: WorkerContext,
    args: ApplyMolSelStringArgs,
): ApplyMolSelStringResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const mol = scene.getObject(args.molId) as MolCoord | null;
    if (!mol) return { ok: false };

    const sel = makeSel(ctx, args.selStr, scene.uid);
    if (sel === null) return { ok: false };

    withUndoTxn(scene, 'Change mol selection', () => {
        // Auto-create the special `*selection` renderer so visual feedback
        // shows the moment we assign `mol.sel`. Mirrors UXP's
        // chgMolSel(..., true) behaviour.
        if (!mol.getRendererByType('*selection')) {
            mol.createRenderer('*selection');
        }
        mol.sel = sel;
    });

    return { ok: true };
}

export const services = {
    applyMolSelString,
};
