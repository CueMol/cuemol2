// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';

export interface ValidateSelectionArgs {
    selStr: string;
    sceneId: number;
}

export interface ValidateSelectionResult {
    ok: boolean;
}

export function validateSelection(ctx: WorkerContext, args: ValidateSelectionArgs): ValidateSelectionResult {
    const sel = makeSel(ctx, args.selStr, args.sceneId);
    return { ok: sel !== null };
}
