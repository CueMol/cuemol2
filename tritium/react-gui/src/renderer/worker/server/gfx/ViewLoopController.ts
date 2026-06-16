/**
 * @file worker/server/gfx/ViewLoopController.ts
 * @description Per-view requestAnimationFrame render loop for GfxManager.
 *
 * Owns the per-view rAF callback id map and drives the render loop: each frame
 * pumps the C++ event/timer queue (so AnimMgr playback advances inside the
 * Worker, where the Electron libuv timer that would call performIdleTasks is
 * not driven) and then calls checkAndUpdateScenes. A render-loop fault is
 * forwarded to the renderer as a `__worker_crash__` message and re-thrown so
 * the worker global error handler can capture filename / line.
 *
 * GfxManager owns one of these; its public view-lifecycle methods
 * (startViewLoop / stopViewLoop, and activateView / removeView indirectly)
 * forward here. Only one view renders at a time (single shared canvas), so the
 * caller stops the other loops on activation.
 */
import { PERF_MEASURE, maybeFlushPerf, perfCounters } from '../perf';

/** Predicate: whether a view id is currently bound as a render peer. */
type IsBound = (viewId: number) => boolean;

/**
 * Drives the requestAnimationFrame render loop for bound views.
 *
 * @param cuemol - the native addon root (for performIdleTasks pumping)
 * @param sceMgr - SceneManager wrapper (for checkAndUpdateScenes)
 * @param isBound - predicate to skip starting a loop for an unbound view
 */
export class ViewLoopController {
    private _afcbid_map: Map<number, number> = new Map();

    constructor(
        private cuemol: any,
        private sceMgr: any,
        private isBound: IsBound,
    ) {}

    /** View ids that currently have a scheduled rAF loop. */
    activeViewIds(): number[] {
        return [...this._afcbid_map.keys()];
    }

    /**
     * Start the requestAnimationFrame render loop for a view. Each frame calls
     * checkAndUpdateScenes; an existing loop for the same view is cancelled
     * first. No-op if the view is not bound.
     */
    startViewLoop(view_id: number): void {
        if (!this.isBound(view_id)) {
            console.warn(`startViewLoop: view ${view_id} not in bound_views, skipping`);
            return;
        }
        // Cancel existing loop for this view if any
        const existing = this._afcbid_map.get(view_id);
        if (existing !== undefined) cancelAnimationFrame(existing);
        const render = (): void => {
            try {
                // Pump the C++ event / timer queue before rendering so AnimMgr
                // playback (and any other setTimer-based work) advances and its
                // camera update is drawn this same frame. The Electron libuv
                // timer that would normally call performIdleTasks is not driven
                // inside the Worker, so the render loop services it here. Guarded
                // so an older native addon (without the export) degrades to a
                // no-op rather than throwing.
                if (typeof this.cuemol.performIdleTasks === 'function') {
                    this.cuemol.performIdleTasks();
                }
                if (PERF_MEASURE) {
                    const t0 = performance.now();
                    this.sceMgr.invokeMethod('checkAndUpdateScenes');
                    const elapsed = performance.now() - t0;
                    perfCounters.frameCount++;
                    perfCounters.frameTimeMs += elapsed;
                    if (elapsed > perfCounters.frameTimeMaxMs) {
                        perfCounters.frameTimeMaxMs = elapsed;
                    }
                    maybeFlushPerf();
                } else {
                    this.sceMgr.invokeMethod('checkAndUpdateScenes');
                }
                this._afcbid_map.set(view_id, requestAnimationFrame(render));
            } catch (err) {
                // A render-loop fault is fatal -- do not reschedule the rAF.
                // Forward to the renderer so the fallback UI surfaces; also
                // re-throw so the worker global error handler in
                // worker_launcher.ts can capture filename / line via the
                // ErrorEvent (some C++ throws have no usable .stack).
                const e = err as { message?: unknown; stack?: unknown };
                try {
                    self.postMessage(['__worker_crash__', {
                        message: typeof e?.message === 'string' ? e.message : String(err),
                        stack: typeof e?.stack === 'string' ? e.stack : undefined,
                        type: 'render-loop',
                    }]);
                } catch (_postErr) { /* worker may already be torn down */ }
                throw err;
            }
        };
        render();
    }

    /** Cancel a view's requestAnimationFrame render loop, if running. */
    stopViewLoop(view_id: number): void {
        const id = this._afcbid_map.get(view_id);
        if (id !== undefined) {
            cancelAnimationFrame(id);
            this._afcbid_map.delete(view_id);
        }
    }
}
