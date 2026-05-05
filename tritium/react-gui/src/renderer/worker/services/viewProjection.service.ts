import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { WorkerContext } from '../types/WorkerContext';

export interface ViewProjectionArgs {
    viewId: number;
    perspective?: boolean;
}

export interface ViewProjectionResult {
    ok: boolean;
    perspective: boolean;
}

function getViewProjection(ctx: WorkerContext, args: ViewProjectionArgs): ViewProjectionResult {
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    return { ok: true, perspective: view.perspective };
}

function setViewProjection(ctx: WorkerContext, args: ViewProjectionArgs): ViewProjectionResult {
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    view.perspective = args.perspective === true;
    return { ok: true, perspective: view.perspective };
}

export const services = {
    getViewProjection,
    setViewProjection,
};
