// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';
import { makeSel } from './helpers/makeSel';

export interface ValidateSelectionArgs {
    selStr: string;
    sceneId: number;
}

export interface ValidateSelectionResult {
    ok: boolean;
}

function validateSelection(ctx: WorkerContext, args: ValidateSelectionArgs): ValidateSelectionResult {
    const sel = makeSel(ctx, args.selStr, args.sceneId);
    return { ok: sel !== null };
}

export const services = { validateSelection };
