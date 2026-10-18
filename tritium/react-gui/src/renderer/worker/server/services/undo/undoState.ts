// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Kept apart from undo.ts: this one reads the op catalogue (for the step
// texts), and the catalogue imports undo.ts.
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { actionRows } from '@renderer/worker/server/actions/actionLog';
import { describeRow } from '@renderer/worker/server/actions/describe';

export interface GetUndoStateArgs {
    sceneId: number;
}

export interface UndoState {
    canUndo: boolean;
    canRedo: boolean;
    /** Transaction descriptions, index 0 = most recent (next single undo). */
    undoDescs: string[];
    /** Transaction descriptions, index 0 = next single redo. */
    redoDescs: string[];
    /**
     * What each undo step did, for display, in `undoDescs` order: the step's
     * recorded ops when it has any, else its description.
     */
    undoTexts: string[];
    /** The same for the redo side, in `redoDescs` order. */
    redoTexts: string[];
}

/**
 * Snapshot the undo/redo stack for a scene: availability flags plus the
 * ordered transaction descriptions. Mirrors UXP `populateUndoMenu` /
 * `updateCmdUndoState` (getUndoSize + getUndoDesc(i) loop). Index i maps to
 * `scene.undo(i)` (undoes i+1 transactions) on the consumer side.
 */
export function getUndoState(ctx: WorkerContext, args: GetUndoStateArgs): UndoState {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) {
        return { canUndo: false, canRedo: false, undoDescs: [], redoDescs: [], undoTexts: [], redoTexts: [] };
    }
    const undoDescs: string[] = [];
    const nu = scene.getUndoSize();
    for (let i = 0; i < nu; ++i) undoDescs.push(scene.getUndoDesc(i));
    const redoDescs: string[] = [];
    const nr = scene.getRedoSize();
    for (let i = 0; i < nr; ++i) redoDescs.push(scene.getRedoDesc(i));

    // The rows run oldest first, the redo side last, one per stack entry.
    const rows = actionRows(scene, args.sceneId);
    const textAt = (index: number, desc: string): string => {
        const row = rows[index];
        return row && row.label === desc ? describeRow(row) : desc;
    };
    return {
        canUndo: scene.isUndoable(),
        canRedo: scene.isRedoable(),
        undoDescs,
        redoDescs,
        undoTexts: undoDescs.map((d, i) => textAt(nu - 1 - i, d)),
        redoTexts: redoDescs.map((d, i) => textAt(nu + i, d)),
    };
}
