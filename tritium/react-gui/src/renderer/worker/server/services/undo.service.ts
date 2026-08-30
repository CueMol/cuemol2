// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';

export interface UndoArgs {
    sceneId: number;
    depth?: number;
}

function undo(ctx: WorkerContext, args: UndoArgs): { ok: boolean } {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    return { ok: scene.undo(args.depth ?? 0) };
}

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
}

/**
 * Snapshot the undo/redo stack for a scene: availability flags plus the
 * ordered transaction descriptions. Mirrors UXP `populateUndoMenu` /
 * `updateCmdUndoState` (getUndoSize + getUndoDesc(i) loop). Index i maps to
 * `scene.undo(i)` (undoes i+1 transactions) on the consumer side.
 */
function getUndoState(ctx: WorkerContext, args: GetUndoStateArgs): UndoState {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) {
        return { canUndo: false, canRedo: false, undoDescs: [], redoDescs: [] };
    }
    const undoDescs: string[] = [];
    const nu = scene.getUndoSize();
    for (let i = 0; i < nu; ++i) undoDescs.push(scene.getUndoDesc(i));
    const redoDescs: string[] = [];
    const nr = scene.getRedoSize();
    for (let i = 0; i < nr; ++i) redoDescs.push(scene.getRedoDesc(i));
    return {
        canUndo: scene.isUndoable(),
        canRedo: scene.isRedoable(),
        undoDescs,
        redoDescs,
    };
}

export interface ClearUndoDataArgs {
    sceneId: number;
}

/**
 * Discard the scene's whole undo/redo history (Edit > Clear undo data;
 * UXP `Qm2Main.clearUndoData`). Not wrapped in a txn -- it clears the txn
 * stack itself. C++ fires SCE_SCENE_UNDOINFO, so subscribed UI refreshes.
 */
function clearUndoData(ctx: WorkerContext, args: ClearUndoDataArgs): { ok: boolean } {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) return { ok: false };
    scene.clearUndoData();
    return { ok: true };
}

export const services = { undo, getUndoState, clearUndoData };
