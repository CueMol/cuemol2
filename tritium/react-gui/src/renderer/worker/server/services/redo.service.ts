// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';

export interface RedoArgs {
    sceneId: number;
    depth?: number;
}

function redo(ctx: WorkerContext, args: RedoArgs): { ok: boolean } {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    return { ok: scene.redo(args.depth ?? 0) };
}

export const services = { redo };
