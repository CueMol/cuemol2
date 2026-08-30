// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';

export interface RedoArgs {
    sceneId: number;
    depth?: number;
}

export function redo(ctx: WorkerContext, args: RedoArgs): { ok: boolean } {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    return { ok: scene.redo(args.depth ?? 0) };
}
