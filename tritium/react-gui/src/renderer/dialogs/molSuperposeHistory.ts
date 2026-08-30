/**
 * @file components/dialogs/molSuperposeHistory.ts
 * @description localStorage-backed history for the Molecular superposition
 * dialog. Mirrors UXP `ssm_sup.js` preference persistence
 * (`cuemol2.ui.histories.mol_superpose_*`): the last-used reference / moving
 * molecule uids, the chosen algorithm, and the two checkbox states are saved
 * on a successful superposition and restored when the dialog reopens.
 *
 * Selection-string history is NOT stored here -- it is delegated to the
 * shared MolSelList `selHistory` store so it stays consistent with every
 * other selection input.
 */

import { loadJSON, saveJSON } from '@renderer/utils/localStorageJSON';
import type { SuperposeAlgo } from '@renderer/worker/server/services/superposeMol.service';

export const STORAGE_KEY = 'cuemol2.ui.histories.mol_superpose';

export interface MolSuperposeHistory {
    refObjId?: number;
    movObjId?: number;
    algo: SuperposeAlgo;
    autoRecenter: boolean;
    useprop: boolean;
}

export const DEFAULT_HISTORY: MolSuperposeHistory = {
    algo: 'LSQ',
    autoRecenter: true,
    useprop: false,
};

function asHistory(raw: unknown): MolSuperposeHistory | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const o = raw as Record<string, unknown>;
    const algo: SuperposeAlgo = o.algo === 'SSM' ? 'SSM' : 'LSQ';
    return {
        refObjId: typeof o.refObjId === 'number' ? o.refObjId : undefined,
        movObjId: typeof o.movObjId === 'number' ? o.movObjId : undefined,
        algo,
        autoRecenter: typeof o.autoRecenter === 'boolean' ? o.autoRecenter : DEFAULT_HISTORY.autoRecenter,
        useprop: typeof o.useprop === 'boolean' ? o.useprop : DEFAULT_HISTORY.useprop,
    };
}

export function loadMolSuperposeHistory(): MolSuperposeHistory {
    return loadJSON(STORAGE_KEY, asHistory, DEFAULT_HISTORY);
}

export function saveMolSuperposeHistory(hist: MolSuperposeHistory): void {
    saveJSON(STORAGE_KEY, hist);
}
