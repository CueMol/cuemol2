/**
 * @file worker/server/services/select/simplifySelection.ts
 * @description The Selection Builder's step: an expression it built by
 * combining the current selection with a term, made shorter and equivalent
 * (`helpers/simplifySel.ts`). Read-only.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { simplifySel } from '@renderer/worker/server/services/helpers/simplifySel';

export interface SimplifySelectionArgs {
    selStr: string;
    sceneId: number;
}

export interface SimplifySelectionResult {
    /** The simplified expression, or `selStr` itself when it cannot be. */
    selStr: string;
}

export function simplifySelection(ctx: WorkerContext, args: SimplifySelectionArgs): SimplifySelectionResult {
    return { selStr: simplifySel(ctx, args.selStr, args.sceneId) };
}
