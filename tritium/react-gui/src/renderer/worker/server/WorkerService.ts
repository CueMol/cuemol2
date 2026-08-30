// NOTE: @cuemol/core is externalized in the Vite worker build (see
// react-gui/electron.vite.config.ts) so that the native addon is loaded
// via require() at runtime rather than bundled by Vite.
import { NO_REPLY_SEQ } from '../shared/protocol';
import { getModule } from '@cuemol/core';
import { CueMol } from '@cuemol/core/src/cuemol';
import type { CueMolInternal } from '@cuemol/core/src/interfaces';
import { GfxManager } from './gfx_manager';
import type { SceneManager } from '@cuemol/core/src/wrappers/SceneManager';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { CmdMgr } from '@cuemol/core/src/wrappers/CmdMgr';
import type { StreamManager } from '@cuemol/core/src/wrappers/StreamManager';
import type { ScrEventManager } from '@cuemol/core/src/wrappers/ScrEventManager';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { StyleManager } from '@cuemol/core/src/wrappers/StyleManager';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import {
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleGesture,
    handleWheel,
} from './inputEvents';
import {
    loadUserStyle as loadUserStyleImpl,
    saveUserStyle as saveUserStyleImpl,
    setViewInputConfigStyle as setViewInputConfigStyleImpl,
    registerWorkerEventListener,
} from './workerLifecycle';

import type {
    MethodKey,
    RpcKey,
    ServiceFn,
    ServiceKey,
} from '@renderer/worker/shared/calls';
import { forgetAnimProgress, pauseInactivePlayback, pumpAnimProgress } from '@renderer/worker/server/services/anim/anim.service';
import { isSceneBeingRendered } from '@renderer/worker/server/services/renderjob/renderJob.service';

// import { createLogger } from '@cuemol/core/src/logger';
// const log = createLogger(import.meta.url);
const log = console;

/** Erased dispatch-table value types (per-key types are enforced by the maps). */
type AnyMethodFn = (...args: any[]) => any;
type AnyServiceFn = (ctx: WorkerContext, args: any) => any | Promise<any>;

/**
 * Worker-thread RPC coordinator.
 *
 * Owns the two dispatch tables and the `invoke()` entry point. The actual
 * method implementations live in sibling modules:
 *   - `inputEvents.ts`      -- pointer / wheel / gesture handling
 *   - `workerLifecycle.ts`  -- user-style / input-config / event wiring
 *   - `textRender.ts`       -- OffscreenCanvas text rasterisation
 * The `ctx.svc` facade (`createObj` / `getService` / `pushMessage` /
 * `fromTypedArray` / `addView`) and the canvas/view delegation stay here.
 */
export class WorkerService {

    private _methods: { [K in MethodKey | RpcKey]: AnyMethodFn };
    private _registered: { [K in ServiceKey]?: AnyServiceFn } = {};
    private _internal: CueMolInternal;
    private _cm: CueMol;
    private _gfx_mgr: GfxManager | null = null;
    private _postMessage: (data: any[]) => void;
    private _close: () => void;
    private _sceMgr: SceneManager | null = null;
    private _cmdMgr: CmdMgr | null = null;
    private _strMgr: StreamManager | null = null;
    private _styleMgr: StyleManager | null = null;
    private _evtMgr: ScrEventManager | null = null;
    /** Listener id from `registerWorkerEventListener`, for teardown. */
    private _evtListenerId: number | null = null;

    constructor(
        postMessage: (data: any[]) => void,
        close: () => void = () => { }
    ) {
        this._internal = getModule();
        this._cm = new CueMol({ internal: this._internal });
        this._postMessage = postMessage;
        this._close = close;
        log.info('_internal:', this._internal);

        this._methods = {
            'initCueMol': this.initCueMol,
            'loadUserStyle': this.loadUserStyle,
            'saveUserStyle': this.saveUserStyle,
            'setViewInputConfigStyle': this.setViewInputConfigStyle,
            'terminateWorker': this.terminateWorker,
            'hasClass': this._rpcHasClass,
            'getAllClassNamesJSON': this._rpcGetAllClassNamesJSON,
            //
            'addEventListener': this.addEventListener,
            'removeEventListener': this.removeEventListener,
            'bindCanvas': this.bindCanvas,
            'addView': this.addView,
            'activateView': this.activateView,
            'removeView': this.removeView,
            'resized': this.resized,
            'mouseDown': this.mouseDown,
            'mouseUp': this.mouseUp,
            'mouseMove': this.mouseMove,
            'wheel': this.wheelEvent,
            'gesture': this.gestureEvent,
        }
    }

    /**
     * Register a business-logic service handler under `name`.
     * Called once per `*.service.ts` entry during worker startup; the key
     * must exist in `ServiceMap` (worker/shared/calls/).
     */
    register<K extends ServiceKey>(name: K, fn: ServiceFn<K>): void {
        if (name in this._registered) {
            log.warn(`WorkerService.register: overwriting "${name}"`);
        }
        this._registered[name] = fn as AnyServiceFn;
    }

    /**
     * Create a new native C++ object and return its TS wrapper.
     * Service-side facade exposed as `ctx.svc.createObj`.
     */
    createObj(className: string): any | null {
        const obj = this._internal.createObj(className);
        if (!obj) return null;
        return this._cm.createWrapper(obj);
    }

    /**
     * Resolve a native singleton service and return its TS wrapper.
     * Service-side facade exposed as `ctx.svc.getService`.
     */
    getService(className: string): any | null {
        const obj = this._internal.getService(className);
        if (!obj) return null;
        return this._cm.createWrapper(obj);
    }

    /**
     * Push a message to the renderer on an out-of-band channel (no reply).
     * Used by long-running services (e.g. render jobs) to stream updates.
     */
    pushMessage(channel: string, ...args: unknown[]): void {
        this._postMessage([channel, ...args]);
    }

    /**
     * Wrap a TypedArray as a ByteArray that shares memory (zero-copy).
     * Used by streaming services to feed binary chunks into C++ readers.
     */
    fromTypedArray(src: any): any | null {
        return this._cm.fromTypedArray(src);
    }

    /**
     * Copy a ByteArray's bytes out into a new Uint8Array.
     *
     * The copying pair rather than the zero-copy `toTypedArray` /
     * `fromTypedArray`: these cross the worker boundary (clipboard payloads
     * are structured-cloned to the renderer), so the buffer must not alias
     * C++-owned memory whose ByteArray may be collected.
     */
    copyToTypedArray(src: any): any {
        return this._cm.copyToTypedArray(src);
    }

    /** Build a new ByteArray holding a copy of a TypedArray's bytes. */
    copyFromTypedArray(src: any): any | null {
        return this._cm.copyFromTypedArray(src);
    }

    private _buildContext(): WorkerContext {
        return {
            svc: this,
            sceMgr: this._sceMgr!,
            cmdMgr: this._cmdMgr!,
            strMgr: this._strMgr!,
            styleMgr: this._styleMgr!,
        };
    }

    /**
     * Single entry point for every renderer -> worker call.
     *
     * Looks `method` up in both dispatch tables and replies on the same
     * channel with `[method, seqno, ok, ...result]`:
     *   - `_methods` (infrastructure / RPC): invoked synchronously via apply.
     *   - `_registered` (business services): invoked async with a fresh
     *     `WorkerContext`; only the first arg is passed.
     * An unknown method replies with `ok = false`.
     *
     * @param method - dispatch-table key
     * @param seqno - renderer-side sequence number, echoed back for matching
     * @param args - call arguments
     */
    invoke(method: string, seqno: number, args: any[]): void {
        // log.info(`Worker> invoke called: ${method} seqno: ${seqno} args:`, args);
        // A fire-and-forget call: nothing on the renderer side is waiting, so
        // a reply would be posted, structured-cloned and dropped. At pointer
        // rates that is a second message per frame for no one.
        const reply = seqno === NO_REPLY_SEQ
            ? () => undefined
            : (data: any[]) => this._postMessage(data);
        const methodFn = (this._methods as Record<string, AnyMethodFn>)[method];
        const serviceFn = (this._registered as Record<string, AnyServiceFn | undefined>)[method];
        if (methodFn) {
            try {
                const result = methodFn.apply(this, args);
                if (Array.isArray(result)) {
                    reply([method, seqno, true, ...result]);
                } else {
                    reply([method, seqno, true, result]);
                }
            } catch (e) {
                log.error(`Worker> call method failed: ${method},`, e);
                // Stringify like the service branch below does: a raw thrown
                // value is not necessarily structured-cloneable, and a
                // DataCloneError raised inside this catch would escape
                // self.onmessage and be funnelled as __worker_crash__ --
                // tearing down the whole worker over one failed call.
                reply([method, seqno, false, String(e)]);
            }
        } else if (serviceFn) {
            Promise.resolve()
                .then(() => serviceFn(this._buildContext(), args[0]))
                .then((result) => reply([method, seqno, true, result]))
                .catch((e) => {
                    // A service returns Result and never throws across the
                    // boundary (worker/shared/result.ts). Reaching here means a
                    // bug, not an expected failure; the wire shape is kept so
                    // the renderer still sees a rejection rather than a hang.
                    log.error(`Worker> service '${method}' threw instead of returning fail():`, e);
                    reply([method, seqno, false, String(e)]);
                });
        } else {
            log.error(`Worker> unknown method: ${method}`);
            reply([method, seqno, false]);
        }
    }

    //////////
    // Class-registry RPC handlers. Forward straight to the CueMol facade
    // (no slot table / ObjProxy involved). Kept as methods so the
    // `_methods` dispatch table binds stable references at construction.

    private _rpcHasClass(className: string): boolean {
        return this._cm.hasClass(className);
    }

    private _rpcGetAllClassNamesJSON(): string {
        return this._cm.getAllClassNamesJSON();
    }

    //////////

    /**
     * Initialize the C++ library, then resolve the core service singletons
     * (`SceneManager` / `CmdMgr` / `StreamManager` / `StyleManager` /
     * `ScrEventManager`) and the `GfxManager`, and wire the event listener.
     * Must be the first worker call; all other methods assume it has run.
     */
    initCueMol(loadPath?: string): boolean {
        log.info(`Worker> initCueMol called, loadPath: ${loadPath}`);
        this._cm.initCueMol(loadPath);
        log.info('Worker> initCueMol OK');

        // Animation playback runs on a C++ timer the render loop pumps; this
        // is where the worker notices it moved and tells the renderer. The
        // context is built per frame so the sampler resolves the manager from
        // whatever scene is live, rather than holding one.
        this._gfx_mgr = new GfxManager(
            this._internal,
            () => pumpAnimProgress(this._buildContext()),
        );
        this._sceMgr = this._cm.getSceneManager();
        this._cmdMgr = this._cm.getService('CmdMgr') as CmdMgr;
        this._strMgr = this._cm.getService('StreamManager') as StreamManager;
        this._styleMgr = this._cm.getService('StyleManager') as StyleManager;
        this._evtMgr = this._cm.getService('ScrEventManager') as ScrEventManager;

        this._evtListenerId = registerWorkerEventListener(
            this._evtMgr, this._cm, this._postMessage,
        );

        return true;
    }

    /** Load the user style set (see `workerLifecycle.loadUserStyle`). */
    loadUserStyle(userStylePath?: string): boolean {
        return loadUserStyleImpl(this._cm, userStylePath);
    }

    /** Save the user style set (see `workerLifecycle.saveUserStyle`). */
    saveUserStyle(userStylePath: string): boolean {
        return saveUserStyleImpl(this._cm, userStylePath);
    }

    /** Select the active mouse/gesture input-config preset. */
    setViewInputConfigStyle(styleName: string): boolean {
        return setViewInputConfigStyleImpl(this._cm, styleName);
    }

    /** Shut the worker down (closes the worker global scope). */
    terminateWorker(): void {
        log.info('Worker> terminateWorker called');
        // Hand the event-manager subscription back before closing: the C++
        // side holds this callback, and a re-initialised worker would
        // otherwise stack a second one on top of it.
        if (this._evtMgr !== null && this._evtListenerId !== null) {
            try {
                this._evtMgr.removeListener(this._evtListenerId);
            } catch (e) {
                log.warn('Worker> removeListener failed:', e);
            }
            this._evtListenerId = null;
        }
        this._close();
    }

    //////////

    /**
     * Subscribe to the CueMol event manager and return a slot id the
     * renderer later passes to `removeEventListener`.
     */
    addEventListener(aCatStr: string, aSrcType: any, aEvtType: any, aSrcID: number): number {
        const slot_id = this._evtMgr!.append(aCatStr, aSrcType, aEvtType, aSrcID);
        console.log('addEventListener OK slot_id=', slot_id);
        return slot_id;
    }

    /** Unsubscribe a previously registered event listener by slot id. */
    removeEventListener(nID: number): any {
        return this._evtMgr!.remove(nID);
    }

    /**
     * One-time WebGL init: bind the transferred OffscreenCanvas to the
     * GfxManager and activate the given view. Calling twice throws (the
     * canvas can only be transferred once); use `addView` for extra views.
     */
    bindCanvas(canvas: any, view_id: number, dpr: number, width: number, height: number): boolean {
        if (this._gfx_mgr) {
            console.log('bindCanvas:', view_id, dpr, width, height);
            this._gfx_mgr.bindCanvas(canvas, view_id, dpr);
            // Size the backing store before the first frame. The transferred
            // canvas arrives at its attribute size (300x150 unless set), and a
            // frame drawn at that size is stretched over the whole pane until
            // the first `resized` lands -- a huge, blocky centre mark for a
            // moment at launch. With the size known, activateView syncs the
            // view and draws the first frame right.
            if (width > 0 && height > 0) {
                canvas.width = width * dpr;
                canvas.height = height * dpr;
                this._gfx_mgr.setLogicalSize(width, height);
            }
            this._gfx_mgr.activateView(view_id);
            return true;
        } else {
            console.error('bindCanvas: gfx mgr not initialized');
            return false;
        }
    }

    /**
     * Attach an additional view to the already-bound canvas and activate it.
     * Used for new scene tabs (`bindCanvas` is the one-time init).
     */
    addView(view_id: number, dpr: number): boolean {
        if (this._gfx_mgr) {
            console.log('addView:', view_id, dpr);
            this._gfx_mgr.addView(view_id, dpr);
            this._gfx_mgr.activateView(view_id);
            return true;
        } else {
            console.error('addView: gfx mgr not initialized');
            return false;
        }
    }

    /**
     * Make `view_id` the view driven by the render loop.
     *
     * Also pauses interactive playback in every other scene: only this view
     * draws to the canvas, so an animation left playing in a background tab
     * would move a camera nobody sees. A scene an animation render is
     * driving is left alone (see pauseInactivePlayback).
     */
    activateView(view_id: number): void {
        if (!this._gfx_mgr) {
            console.error('activateView: gfx mgr not initialized');
            return;
        }
        this._gfx_mgr.activateView(view_id);

        if (!this._sceMgr) return;
        let activeSceneUid: number | undefined;
        try {
            const view = this._sceMgr.getView(view_id) as unknown as { getScene: () => Scene | null } | null;
            activeSceneUid = view?.getScene()?.uid;
        } catch (e) {
            console.warn(`activateView: view ${view_id} not found:`, e);
            return;
        }
        // Without knowing which scene is in front there is no "behind" to
        // pause; pausing everything could stop the one the user is watching.
        if (activeSceneUid === undefined) return;
        pauseInactivePlayback(this._buildContext(), activeSceneUid, isSceneBeingRendered);
    }

    /** Detach a view from the GfxManager (used when a scene tab closes). */
    /**
     * Close a molview tab's view, in the order that makes it safe.
     *
     * 1. Stop the scene's animation. Its timer would otherwise keep firing
     *    into objects about to be destroyed, and a loop would restart it.
     * 2. Unbind the view from the canvas.
     * 3. Destroy. When this was the scene's last view the scene goes with it:
     *    `destroyScene` runs `unloading()` over the views first, which
     *    releases their GL resources while the context is still alive (the
     *    pipeline torn down from a destructor instead re-enters the dying
     *    view and traps), then the objects, then the scene itself -- whose
     *    destructor removes the animation manager's timer for good.
     *
     * Until this existed, closing a tab left the scene alive with everything
     * running: a looping animation kept drawing into the shared canvas over
     * whatever was opened next, and every closed scene stayed in memory.
     */
    removeView(view_id: number): boolean {
        if (!this._gfx_mgr) {
            console.error('removeView: gfx mgr not initialized');
            return false;
        }
        console.log('removeView:', view_id);

        const sceMgr = this._sceMgr;
        let scene: Scene | null = null;
        if (sceMgr) {
            try {
                const view = sceMgr.getView(view_id) as unknown as { getScene: () => Scene | null } | null;
                scene = view?.getScene() ?? null;
            } catch (e) {
                console.warn(`removeView: view ${view_id} not found:`, e);
            }
        }

        // 1. Stop the animation before anything it touches goes away. stop()
        //    on an idle manager is a no-op, so there is nothing to check first.
        if (scene) {
            try {
                scene.getAnimMgr()?.stop();
            } catch (e) {
                console.warn('removeView: stopping animation failed:', e);
            }
            forgetAnimProgress(scene.uid);
        }

        // 2. Off the canvas.
        this._gfx_mgr.removeView(view_id);

        // 3. Destroy: the scene with its last view, else just the view.
        if (scene && sceMgr) {
            try {
                if (scene.getViewCount() <= 1) {
                    const sceneUid = scene.uid;
                    console.log('removeView: last view closed, destroying scene', sceneUid);
                    sceMgr.destroyScene(sceneUid);
                } else {
                    scene.destroyView(view_id);
                }
            } catch (e) {
                console.warn(`removeView: tearing down view ${view_id} failed:`, e);
            }
        }
        return true;
    }

    /**
     * Handle a viewport resize event sent from the main thread.
     *
     * Setting `canvas.width` or `canvas.height` on an OffscreenCanvas clears
     * the WebGL drawing buffer immediately (WebGL spec behaviour).  The render
     * loop driven by `requestAnimationFrame` in `setUpdateView` would normally
     * redraw on the *next* frame, leaving one blank frame visible -- that is the
     * flicker the user would see during window resize.
     *
     * To prevent the blank frame, `checkAndUpdate` is called synchronously
     * right after the resize so that the new content is composited in the same
     * task as the buffer clear, before the browser has a chance to display the
     * cleared (black) state.
     *
     * @param view_id - CueMol view UID
     * @param w  - new CSS (logical) width in pixels
     * @param h  - new CSS (logical) height in pixels
     * @param dpr - device pixel ratio; the backing store is sized to w*dpr x h*dpr
     */
    resized(view_id: number, w: number, h: number, dpr: number): void {
        if (this._sceMgr === null || this._gfx_mgr === null) {
            console.error('resized: scene manager or gfx manager not initialized');
            return;
        }
        // Resolve the view BEFORE touching the canvas. Resizing the backing
        // store clears it, so discovering the view is gone afterwards leaves
        // a blank canvas and throws on the way out -- one black frame with no
        // redraw to follow it.
        const view = this._resolveView(view_id);
        if (!view) return;
        this._gfx_mgr.canvas.width = w * dpr;
        this._gfx_mgr.canvas.height = h * dpr;
        // Store logical size so that activateView can sync new views to the canvas dimensions
        this._gfx_mgr.setLogicalSize(w, h);
        view.sizeChanged(w, h);
        // Force immediate redraw to avoid blank frame after canvas buffer clear
        view.checkAndUpdate();
    }

    //////////
    // Input events -- resolve `view_id -> GUIView` then delegate to inputEvents.

    /**
     * Resolve `view_id` to a live view, or null.
     *
     * Input events keep arriving for a fraction of a second after a view is
     * destroyed -- the renderer posts them from a pointer stream it does not
     * stop synchronously -- so "no such view" is an ordinary outcome here, not
     * an error. Every caller below treats it as "drop this event".
     */
    private _resolveView(view_id: number): GUIView | null {
        if (this._sceMgr === null) return null;
        try {
            return (this._sceMgr.getView(view_id) as GUIView | null) ?? null;
        } catch {
            return null;
        }
    }

    mouseDown(view_id: number, event: any): void {
        const view = this._resolveView(view_id);
        if (view) handleMouseDown(view, event);
    }

    mouseUp(view_id: number, event: any): void {
        const view = this._resolveView(view_id);
        if (view) handleMouseUp(view, event);
    }

    mouseMove(view_id: number, event: any): void {
        const view = this._resolveView(view_id);
        if (view) handleMouseMove(view, event);
    }

    gestureEvent(view_id: number, event: any): void {
        const view = this._resolveView(view_id);
        if (view) handleGesture(view, event);
    }

    wheelEvent(view_id: number, event: any): void {
        const view = this._resolveView(view_id);
        if (view) handleWheel(view, event);
    }

}
