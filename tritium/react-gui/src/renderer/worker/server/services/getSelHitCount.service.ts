// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Read-only atom-count probe for the Selection Builder. Compiles a selection
// string and counts the matching atoms via MolCoord.getAtomSelSize (C++
// AtomIterator walk). This does NOT assign mol.sel and is intentionally NOT
// wrapped in withUndoTxn -- counting must leave no trace in the undo history.
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull } from './helpers/sceneResolver';
import { makeSel } from './helpers/makeSel';

export interface GetSelHitCountArgs {
    sceneId: number;
    molId: number;
    /** Selection-string to count against the molecule. */
    selStr: string;
}

export interface GetSelHitCountResult {
    /** Number of matched atoms, or null when the string fails to compile. */
    count: number | null;
}

function getSelHitCount(ctx: WorkerContext, args: GetSelHitCountArgs): GetSelHitCountResult {
    if (args.selStr.trim() === '') return { count: null };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { count: null };
    const mol = scene.getObject(args.molId) as MolCoord | null;
    if (!mol) return { count: null };
    const sel = makeSel(ctx, args.selStr, scene.uid);
    if (sel === null) return { count: null };
    try {
        return { count: mol.getAtomSelSize(sel) };
    } catch {
        return { count: null };
    }
}

export const services = { getSelHitCount };
