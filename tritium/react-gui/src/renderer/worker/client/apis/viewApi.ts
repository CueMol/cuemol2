/**
 * @file worker/client/apis/viewApi.ts
 * @description Renderer-thread thin wrappers for worker view-lifecycle
 * calls (canvas bind, add / activate / remove view, resize).
 *
 * Each function returns a Promise resolved with the worker reply, except
 * `resized` which is a fire-and-forget `postMessage`.
 */
import { NO_REPLY_SEQ } from '@renderer/worker/shared/protocol';
import { WorkerTransport } from '@renderer/worker/client/WorkerTransport';

const log = console;

/**
 * Transfer an `HTMLCanvasElement`'s control to the worker and bind it as
 * the rendering target for a view.
 *
 * @param transport - Worker transport.
 * @param canvas - DOM canvas element.
 * @param view_id - C++ view uid that owns the canvas.
 * @param dpr - Device pixel ratio.
 * @returns The worker reply (array tail of `invokeWorkerWithTransfer`).
 *
 * @remarks `canvas.transferControlToOffscreen()` may be called **only
 *   once** per element; calling `bindCanvas` twice on the same canvas
 *   throws `InvalidStateError`. After transfer the renderer thread can no
 *   longer read pixels from the canvas. See "OffscreenCanvas / WebGL
 *   lifecycle constraints" in `tritium/CLAUDE.md`.
 */
export async function bindCanvas(
    transport: WorkerTransport, canvas: any, view_id: number, dpr: number,
): Promise<any[]> {
    const offscreen = canvas.transferControlToOffscreen();
    return await transport.invokeWorkerWithTransfer(
        'bindCanvas', offscreen, offscreen, view_id, dpr,
    );
}

/**
 * Attach a new C++ view to the already-bound OffscreenCanvas.
 *
 * @param transport - Worker transport.
 * @param view_id - New view uid.
 * @param dpr - Device pixel ratio.
 * @returns `true` if the worker accepted the view, `false` on failure.
 * @remarks Use this for additional scene tabs; `bindCanvas` is the
 *   one-shot WebGL init.
 */
export async function addView(
    transport: WorkerTransport, view_id: number, dpr: number,
): Promise<boolean> {
    try {
        return await transport.invokeMethod('addView', view_id, dpr);
    } catch (e) {
        log.warn(`addView failed for view_id: ${view_id}`, e);
        return false;
    }
}

/**
 * Make the given view the currently rendered one.
 *
 * @param transport - Worker transport.
 * @param view_id - View uid to activate.
 */
export async function activateView(transport: WorkerTransport, view_id: number): Promise<void> {
    await transport.invokeMethod('activateView', view_id);
}

/**
 * Stop the view loop and remove the view from the worker's `bound_views`.
 *
 * @param transport - Worker transport.
 * @param view_id - View uid to remove.
 * @remarks The C++ `View` / `Scene` objects are not destroyed by this
 *   call; only the renderer-side binding is released.
 */
export async function removeView(transport: WorkerTransport, view_id: number): Promise<void> {
    await transport.invokeMethod('removeView', view_id);
}

/**
 * Notify the worker that a view's canvas was resized.
 *
 * @param transport - Worker transport.
 * @param view_id - View uid.
 * @param w - New width in CSS pixels.
 * @param h - New height in CSS pixels.
 * @param dpr - Device pixel ratio.
 * @remarks Fire-and-forget; no reply is awaited.
 */
export function resized(
    transport: WorkerTransport, view_id: number, w: number, h: number, dpr: number,
): void {
    // Fire-and-forget: a resize has no result to wait for.
    transport.postMessage('resized', NO_REPLY_SEQ, [view_id, w, h, dpr]);
}
