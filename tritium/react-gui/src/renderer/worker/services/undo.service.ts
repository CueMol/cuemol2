import type { WorkerContext } from '../types/WorkerContext';

export const name = 'undo';

export interface UndoArgs {
    sceneId: number;
    depth?: number;
}

export default function undo(ctx: WorkerContext, args: UndoArgs): { ok: boolean } {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    return { ok: scene.undo(args.depth ?? 0) };
}
