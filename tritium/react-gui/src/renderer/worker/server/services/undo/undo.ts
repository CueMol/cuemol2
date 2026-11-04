// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { syncActionRows } from '@renderer/worker/server/actions/actionLog';
import { stepHistory, type HistoryStepResult } from './historyStep';

export interface UndoArgs {
    sceneId: number;
    depth?: number;
}

/** Undo `depth + 1` steps, one at a time (`stepHistory`). */
export function undo(ctx: WorkerContext, args: UndoArgs): HistoryStepResult {
    return stepHistory(ctx, args, 'undo');
}

export interface ClearUndoDataArgs {
    sceneId: number;
}

/**
 * Discard the scene's whole undo/redo history (Edit > Clear undo data;
 * UXP `Qm2Main.clearUndoData`). Not wrapped in a txn -- it clears the txn
 * stack itself. C++ fires SCE_SCENE_UNDOINFO, so subscribed UI refreshes.
 */
export function clearUndoData(ctx: WorkerContext, args: ClearUndoDataArgs): { ok: boolean } {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) return { ok: false };
    scene.clearUndoData();
    syncActionRows(scene, args.sceneId);
    return { ok: true };
}
