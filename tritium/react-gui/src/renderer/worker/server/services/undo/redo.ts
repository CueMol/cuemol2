// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { stepHistory, type HistoryStepResult } from './historyStep';

export interface RedoArgs {
    sceneId: number;
    depth?: number;
}

/** Redo `depth + 1` steps, one at a time (`stepHistory`). */
export function redo(ctx: WorkerContext, args: RedoArgs): HistoryStepResult {
    return stepHistory(ctx, args, 'redo');
}
