// NOTE: @cuemol/core is externalized in the Vite worker build (see
// react-gui/electron.vite.config.ts) so that the native addon is loaded
// via require() at runtime rather than bundled by Vite.
import { getModule } from '@cuemol/core';
import { CueMol } from '@cuemol/core/src/cuemol';
import type { CueMolInternal } from '@cuemol/core/src/interfaces';
import { GfxManager } from './gfx_manager';
import type { SceneManager } from '@cuemol/core/src/wrappers/SceneManager';
import type { CmdMgr } from '@cuemol/core/src/wrappers/CmdMgr';
import type { StreamManager } from '@cuemol/core/src/wrappers/StreamManager';
import type { ScrEventManager } from '@cuemol/core/src/wrappers/ScrEventManager';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { StyleManager } from '@cuemol/core/src/wrappers/StyleManager';
import type { WorkerContext } from './types/WorkerContext';
import { ObjProxyBridge } from './objProxyBridge';
import {
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleGesture,
    handleWheel,
} from './inputEvents';
import {
    loadUserStyle as loadUserStyleImpl,
    setViewInputConfigStyle as setViewInputConfigStyleImpl,
    registerWorkerEventListener,
} from './workerLifecycle';

import type {
    MethodKey,
    RpcKey,
    ServiceFn,
    ServiceKey,
} from '../shared/WorkerCalls';

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
 *   - `objProxyBridge.ts`   — ObjProxy create / get / set / invoke bridge
 *   - `inputEvents.ts`      — pointer / wheel / gesture handling
 *   - `workerLifecycle.ts`  — user-style / input-config / event wiring
 *   - `textRender.ts`       — OffscreenCanvas text rasterisation
 * The `ctx.svc` facade (`createObj` / `getService` / `pushMessage` /
 * `fromTypedArray` / `addView`) and the canvas/view delegation stay here.
 */
export class WorkerService {

    private _methods: { [K in MethodKey | RpcKey]: AnyMethodFn };
    private _registered: { [K in ServiceKey]?: AnyServiceFn } = {};
    private _internal: CueMolInternal;
    private _cm: CueMol;
    private _bridge: ObjProxyBridge;
    private _gfx_mgr: GfxManager | null = null;
    private _postMessage: (data: any[]) => void;
    private _close: () => void;
    private _sceMgr: SceneManager | null = null;
    private _cmdMgr: CmdMgr | null = null;
    private _strMgr: StreamManager | null = null;
    private _styleMgr: StyleManager | null = null;
    private _evtMgr: ScrEventManager | null = null;

    constructor(
        postMessage: (data: any[]) => void,
        close: () => void = () => { }
    ) {
        this._internal = getModule();
        this._cm = new CueMol({ internal: this._internal });
        this._bridge = new ObjProxyBridge(this._internal, this._cm);
        this._postMessage = postMessage;
        this._close = close;
        log.info('_internal:', this._internal);

        this._methods = {
            'initCueMol': this.initCueMol,
            'loadUserStyle': this.loadUserStyle,
            'setViewInputConfigStyle': this.setViewInputConfigStyle,
            'terminateWorker': this.terminateWorker,
            'createObj': this._rpcCreateObj,
            'getService': this._rpcGetService,
            'hasClass': this._rpcHasClass,
            'getAllClassNamesJSON': this._rpcGetAllClassNamesJSON,
            'getProp': this._rpcGetProp,
            'setProp': this._rpcSetProp,
            'invokeMethod': this._rpcInvokeMethod,
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

    register<K extends ServiceKey>(name: K, fn: ServiceFn<K>): void {
        if (name in this._registered) {
            log.warn(`WorkerService.register: overwriting "${name}"`);
        }
        this._registered[name] = fn as AnyServiceFn;
    }

    createObj(className: string): any | null {
        const obj = this._internal.createObj(className);
        if (!obj) return null;
        return this._cm.createWrapper(obj);
    }

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

    private _buildContext(): WorkerContext {
        return {
            svc: this,
            sceMgr: this._sceMgr!,
            cmdMgr: this._cmdMgr!,
            strMgr: this._strMgr!,
            styleMgr: this._styleMgr!,
        };
    }

    invoke(method: string, seqno: number, args: any[]): void {
        // log.info(`Worker> invoke called: ${method} seqno: ${seqno} args:`, args);
        const methodFn = (this._methods as Record<string, AnyMethodFn>)[method];
        const serviceFn = (this._registered as Record<string, AnyServiceFn | undefined>)[method];
        if (methodFn) {
            try {
                const result = methodFn.apply(this, args);
                if (Array.isArray(result)) {
                    this._postMessage([method, seqno, true, ...result]);
                } else {
                    this._postMessage([method, seqno, true, result]);
                }
            } catch (e) {
                log.error(`Worker> call method failed: ${method},`, e);
                this._postMessage([method, seqno, false, e]);
            }
        } else if (serviceFn) {
            Promise.resolve()
                .then(() => serviceFn(this._buildContext(), args[0]))
                .then((result) => this._postMessage([method, seqno, true, result]))
                .catch((e) => this._postMessage([method, seqno, false, String(e)]));
        } else {
            log.error(`Worker> unknown method: ${method}`);
            this._postMessage([method, seqno, false]);
        }
    }

    //////////
    // ObjProxy bridge — thin forwarders to ObjProxyBridge. Kept as methods
    // so the `_methods` dispatch table binds stable references at construction.

    private _rpcCreateObj(className: string) {
        return this._bridge.createObj(className);
    }

    private _rpcGetService(className: string) {
        return this._bridge.getService(className);
    }

    private _rpcHasClass(className: string) {
        return this._bridge.hasClass(className);
    }

    private _rpcGetAllClassNamesJSON() {
        return this._bridge.getAllClassNamesJSON();
    }

    private _rpcGetProp(thisobj: any, propName: string) {
        return this._bridge.getProp(thisobj, propName);
    }

    private _rpcSetProp(thisobj: any, propName: string, value: any) {
        return this._bridge.setProp(thisobj, propName, value);
    }

    private _rpcInvokeMethod(methodName: string, thisobj: any, args: any[]) {
        return this._bridge.invokeMethod(methodName, thisobj, args);
    }

    //////////

    initCueMol(loadPath?: string): boolean {
        log.info(`Worker> initCueMol called, loadPath: ${loadPath}`);
        this._cm.initCueMol(loadPath);
        log.info('Worker> initCueMol OK');

        this._gfx_mgr = new GfxManager(this._internal);
        this._sceMgr = this._cm.getSceneManager();
        this._cmdMgr = this._cm.getService('CmdMgr') as CmdMgr;
        this._strMgr = this._cm.getService('StreamManager') as StreamManager;
        this._styleMgr = this._cm.getService('StyleManager') as StyleManager;
        this._evtMgr = this._cm.getService('ScrEventManager') as ScrEventManager;

        registerWorkerEventListener(this._evtMgr, this._cm, this._postMessage);

        return true;
    }

    loadUserStyle(userStylePath?: string): boolean {
        return loadUserStyleImpl(this._cm, userStylePath);
    }

    setViewInputConfigStyle(styleName: string): boolean {
        return setViewInputConfigStyleImpl(this._cm, styleName);
    }

    terminateWorker(): void {
        log.info('Worker> terminateWorker called');
        this._close();
    }

    //////////

    addEventListener(aCatStr: string, aSrcType: any, aEvtType: any, aSrcID: number): number {
        const slot_id = this._evtMgr!.append(aCatStr, aSrcType, aEvtType, aSrcID);
        console.log('addEventListener OK slot_id=', slot_id);
        return slot_id;
    }

    removeEventListener(nID: number): any {
        return this._evtMgr!.remove(nID);
    }

    bindCanvas(canvas: any, view_id: number, dpr: number): boolean {
        if (this._gfx_mgr) {
            console.log('bindCanvas:', canvas, view_id, dpr);
            this._gfx_mgr.bindCanvas(canvas, view_id, dpr);
            this._gfx_mgr.activateView(view_id);
            return true;
        } else {
            console.error('bindCanvas: gfx mgr not initialized');
            return false;
        }
    }

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

    activateView(view_id: number): void {
        if (this._gfx_mgr) {
            this._gfx_mgr.activateView(view_id);
        } else {
            console.error('activateView: gfx mgr not initialized');
        }
    }

    removeView(view_id: number): boolean {
        if (this._gfx_mgr) {
            console.log('removeView:', view_id);
            this._gfx_mgr.removeView(view_id);
            return true;
        } else {
            console.error('removeView: gfx mgr not initialized');
            return false;
        }
    }

    /**
     * Handle a viewport resize event sent from the main thread.
     *
     * Setting `canvas.width` or `canvas.height` on an OffscreenCanvas clears
     * the WebGL drawing buffer immediately (WebGL spec behaviour).  The render
     * loop driven by `requestAnimationFrame` in `setUpdateView` would normally
     * redraw on the *next* frame, leaving one blank frame visible — that is the
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
     * @param dpr - device pixel ratio; the backing store is sized to w*dpr × h*dpr
     */
    resized(view_id: number, w: number, h: number, dpr: number): void {
        if (this._sceMgr === null || this._gfx_mgr === null) {
            console.error('resized: scene manager or gfx manager not initialized');
            return;
        }
        const view = this._sceMgr!.getView(view_id) as GUIView;
        this._gfx_mgr.canvas.width = w * dpr;
        this._gfx_mgr.canvas.height = h * dpr;
        // Store logical size so that activateView can sync new views to the canvas dimensions
        this._gfx_mgr.setLogicalSize(w, h);
        view.sizeChanged(w, h);
        // Force immediate redraw to avoid blank frame after canvas buffer clear
        view.checkAndUpdate();
    }

    //////////
    // Input events — resolve `view_id → GUIView` then delegate to inputEvents.

    mouseDown(view_id: number, event: any): void {
        handleMouseDown(this._sceMgr!.getView(view_id) as GUIView, event);
    }

    mouseUp(view_id: number, event: any): void {
        handleMouseUp(this._sceMgr!.getView(view_id) as GUIView, event);
    }

    mouseMove(view_id: number, event: any): void {
        handleMouseMove(this._sceMgr!.getView(view_id) as GUIView, event);
    }

    gestureEvent(view_id: number, event: any): void {
        handleGesture(this._sceMgr!.getView(view_id) as GUIView, event);
    }

    wheelEvent(view_id: number, event: any): void {
        handleWheel(this._sceMgr!.getView(view_id) as GUIView, event);
    }

}
