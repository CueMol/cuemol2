// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { syncActionRows } from '@renderer/worker/server/actions/actionLog';

export interface RedoArgs {
    sceneId: number;
    depth?: number;
}

/** Redo `depth + 1` steps; see `undo` for why the action log is synced here. */
export function redo(ctx: WorkerContext, args: RedoArgs): { ok: boolean } {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    const ok = scene.redo(args.depth ?? 0);
    syncActionRows(scene, args.sceneId);
    return { ok };
}
