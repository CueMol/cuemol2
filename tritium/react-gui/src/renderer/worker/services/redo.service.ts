import type { WorkerContext } from '../types/WorkerContext';

export const name = 'redo';

export interface RedoArgs {
    sceneId: number;
    depth?: number;
}

export default function redo(ctx: WorkerContext, args: RedoArgs): { ok: boolean } {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    return { ok: scene.redo(args.depth ?? 0) };
}
