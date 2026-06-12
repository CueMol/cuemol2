/**
 * @file worker/server/services/viewXform.service.ts
 * @description Read/write of the active view's camera transform: zoom, slab,
 * view distance, view center, and incremental rotation. Backs the View pane
 * (`ViewPane`, UXP `panel.fakedial`).
 *
 * Runs in the Web Worker thread; wrappers are synchronous (no await).
 *
 * Like `viewProjection.service`, the transform setters are NOT wrapped in an
 * undo transaction: camera manipulation is transient view state (the same as
 * mouse navigation) and is intentionally not pushed onto the undo stack.
 * Rotation is applied relatively via `view.rotateView` (degrees); there is no
 * absolute rotation scalar -- see ADR-0025.
 */
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { Vector } from '@cuemol/core/src/wrappers/Vector';
import type { WorkerContext } from '../types/WorkerContext';

/**
 * Transform-related `qsys::View` props this service touches. The generated
 * `GUIView` wrapper type does not surface these base-class props, so they are
 * reached through a narrow structural type (they exist at runtime).
 */
interface ViewXformAccess {
    zoom: number;
    slab: number;
    distance: number;
    center: Vector;
    rotateView(rotX: number, rotY: number, rotZ: number): void;
}

export interface GetViewXformArgs {
    viewId: number;
}

export interface ViewXformResult {
    ok: boolean;
    zoom: number;
    slab: number;
    distance: number;
    centerX: number;
    centerY: number;
    centerZ: number;
}

export interface SetViewXformArgs {
    viewId: number;
    /** Absolute zoom (clamped to >= ZOOM_MIN). */
    zoom?: number;
    /** Absolute slab depth (clamped to >= 0). */
    slab?: number;
    /** Absolute view distance (clamped to >= 0). */
    distance?: number;
    /** Absolute world-space view center. */
    center?: { x: number; y: number; z: number };
}

export interface SetViewXformResult {
    ok: boolean;
}

export interface RotateViewArgs {
    viewId: number;
    rotX: number;
    rotY: number;
    rotZ: number;
}

export interface RotateViewResult {
    ok: boolean;
}

/** Minimum allowed zoom (matches the UXP fakedial-panel lower bound). */
const ZOOM_MIN = 0.01;

const EMPTY_XFORM: ViewXformResult = {
    ok: false,
    zoom: 0,
    slab: 0,
    distance: 0,
    centerX: 0,
    centerY: 0,
    centerZ: 0,
};

function getViewAccess(ctx: WorkerContext, viewId: number): ViewXformAccess | null {
    const view = ctx.sceMgr.getView(viewId) as GUIView | null;
    if (!view) return null;
    return view as unknown as ViewXformAccess;
}

function getViewXform(ctx: WorkerContext, args: GetViewXformArgs): ViewXformResult {
    const view = getViewAccess(ctx, args.viewId);
    if (!view) return EMPTY_XFORM;
    const center = view.center;
    return {
        ok: true,
        zoom: view.zoom,
        slab: view.slab,
        distance: view.distance,
        centerX: center.x,
        centerY: center.y,
        centerZ: center.z,
    };
}

function setViewXform(ctx: WorkerContext, args: SetViewXformArgs): SetViewXformResult {
    const view = getViewAccess(ctx, args.viewId);
    if (!view) return { ok: false };
    if (args.zoom !== undefined) view.zoom = Math.max(ZOOM_MIN, args.zoom);
    if (args.slab !== undefined) view.slab = Math.max(0, args.slab);
    if (args.distance !== undefined) view.distance = Math.max(0, args.distance);
    if (args.center !== undefined) {
        const vec = ctx.svc.createObj('Vector') as unknown as { x: number; y: number; z: number };
        vec.x = args.center.x;
        vec.y = args.center.y;
        vec.z = args.center.z;
        view.center = vec as unknown as Vector;
    }
    return { ok: true };
}

function rotateView(ctx: WorkerContext, args: RotateViewArgs): RotateViewResult {
    const view = getViewAccess(ctx, args.viewId);
    if (!view) return { ok: false };
    view.rotateView(args.rotX, args.rotY, args.rotZ);
    return { ok: true };
}

export const services = {
    getViewXform,
    setViewXform,
    rotateView,
};
