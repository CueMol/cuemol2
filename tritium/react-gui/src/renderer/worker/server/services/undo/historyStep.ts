// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
/**
 * @file worker/server/services/undo/historyStep.ts
 * @description Undo or redo `depth + 1` steps one at a time, so a failure
 * names the step that failed and how many before it went through.
 *
 * C++ `UndoManager` discards the whole undo / redo history when a step fails
 * (the scene may be partly changed; docs/architecture/undo-failure.md), and
 * `Scene.undo(n)` only answers true or false. Stepping here tells the user
 * what happened instead of "nothing to undo".
 */
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { syncActionRows } from '@renderer/worker/server/actions/actionLog';
import { fail, ok, type Result } from '@renderer/worker/shared/result';

export interface HistoryStepArgs {
    sceneId: number;
    /** Number of additional steps (0 = one). */
    depth?: number;
}

/** How many steps were undone (or redone). */
export type HistoryStepResult = Result<{ done: number }>;

/** The scene members stepping reads, per direction. */
function sideOf(scene: Scene, which: 'undo' | 'redo') {
    return which === 'undo'
        ? { size: () => scene.getUndoSize(), desc: () => scene.getUndoDesc(0), step: () => scene.undo(0) }
        : { size: () => scene.getRedoSize(), desc: () => scene.getRedoDesc(0), step: () => scene.redo(0) };
}

/**
 * Undo or redo up to `depth + 1` steps.
 *
 * @returns how many went through; `not-found` when there was nothing to do,
 *   and a `native` failure naming the step that failed (the history is gone
 *   then, and the scene may be partly changed).
 */
export function stepHistory(ctx: WorkerContext, args: HistoryStepArgs, which: 'undo' | 'redo'): HistoryStepResult {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) return fail('scene not found', 'not-found');
    const side = sideOf(scene, which);
    const want = (args.depth ?? 0) + 1;
    let done = 0;
    try {
        while (done < want && side.size() > 0) {
            const desc = side.desc();
            if (!side.step()) {
                // A step C++ marks as not undoable is refused before anything
                // runs, and the history stays; any other failure clears it.
                if (side.size() > 0) break;
                const before = done > 0 ? `${which === 'undo' ? 'Undid' : 'Redid'} ${done} step${done > 1 ? 's' : ''}; ` : '';
                return fail(
                    `${before}${which} of "${desc}" failed, so the undo history was cleared. The scene may be partly changed.`,
                    'native',
                );
            }
            done += 1;
        }
    } finally {
        // C++ fires no event for an undo, so the action log follows here,
        // which is also what tells the renderer the history moved.
        syncActionRows(scene, args.sceneId);
    }
    return done > 0 ? ok({ done }) : fail(`nothing to ${which}`, 'not-found');
}
