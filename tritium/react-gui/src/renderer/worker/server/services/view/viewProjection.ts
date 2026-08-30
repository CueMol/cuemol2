// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { ViewCenterMark } from '@shared/types/menuState';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';

export interface ViewProjectionArgs {
    viewId: number;
    perspective?: boolean;
}

export interface ViewProjectionResult {
    ok: boolean;
    perspective: boolean;
}

export interface ViewCenterMarkArgs {
    viewId: number;
    centerMark?: ViewCenterMark;
}

export interface ViewCenterMarkResult {
    ok: boolean;
    centerMark: ViewCenterMark;
}

export function getViewProjection(ctx: WorkerContext, args: ViewProjectionArgs): ViewProjectionResult {
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    return { ok: true, perspective: view.perspective };
}

export function setViewProjection(ctx: WorkerContext, args: ViewProjectionArgs): ViewProjectionResult {
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    view.perspective = args.perspective === true;
    return { ok: true, perspective: view.perspective };
}

export function getViewCenterMark(ctx: WorkerContext, args: ViewCenterMarkArgs): ViewCenterMarkResult {
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    return { ok: true, centerMark: view.centerMark as unknown as ViewCenterMark };
}

export function setViewCenterMark(ctx: WorkerContext, args: ViewCenterMarkArgs): ViewCenterMarkResult {
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    const centerMark = args.centerMark ?? 'none';
    view.centerMark = centerMark as unknown as number;
    return { ok: true, centerMark: view.centerMark as unknown as ViewCenterMark };
}
