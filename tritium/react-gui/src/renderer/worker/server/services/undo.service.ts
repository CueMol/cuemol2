// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';

export interface UndoArgs {
    sceneId: number;
    depth?: number;
}

function undo(ctx: WorkerContext, args: UndoArgs): { ok: boolean } {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    return { ok: scene.undo(args.depth ?? 0) };
}

export const services = { undo };
