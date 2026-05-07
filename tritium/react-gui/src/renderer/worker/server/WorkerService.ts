// NOTE: @cuemol/core is externalized in the Vite worker build (see
// react-gui/electron.vite.config.ts) so that the native addon is loaded
// via require() at runtime rather than bundled by Vite.
import { getModule } from '@cuemol/core';
import { CueMol } from '@cuemol/core/src/cuemol';
import type { CueMolInternal } from '@cuemol/core/src/interfaces';
import { ObjTuple, isObjTuple } from '../shared/ObjTuple';
import { GfxManager } from './gfx_manager';
import { PERF_MEASURE, perfCounters } from './perf';
import * as event from '../../event';
import type { SceneManager } from '@cuemol/core/src/wrappers/SceneManager';
import type { CmdMgr } from '@cuemol/core/src/wrappers/CmdMgr';
import type { StreamManager } from '@cuemol/core/src/wrappers/StreamManager';
import type { ScrEventManager } from '@cuemol/core/src/wrappers/ScrEventManager';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { StyleManager } from '@cuemol/core/src/wrappers/StyleManager';
import type { ViewInputConfig } from '@cuemol/core/src/wrappers/ViewInputConfig';
import type { TextImgBuf } from '@cuemol/core/src/wrappers/TextImgBuf';
import type { ByteArray } from '@cuemol/core/src/wrappers/ByteArray';
import type { WorkerContext } from './types/WorkerContext';

// import { createLogger } from '@cuemol/core/src/logger';
// const log = createLogger(import.meta.url);
const log = console;

type ServiceMethod = (...args: any[]) => any;
type ServiceFn = (ctx: WorkerContext, args: any) => any | Promise<any>;

const makeModif = (event: any): number => {
    let modif = 0;
    if (event.buttons & 1) modif |= 1; // left button
    if (event.buttons & 4) modif |= 2; // middle button (DOM:4 → CueMol:2)
    if (event.buttons & 2) modif |= 4; // right button  (DOM:2 → CueMol:4)
    if (event.ctrlKey) {
        modif += 32;
    }
    if (event.shiftKey) {
        modif += 64;
    }
    return modif;
};

export class WorkerService {

    private _methods: { [key: string]: ServiceMethod };
    private _registered: { [name: string]: ServiceFn } = {};
    private _internal: CueMolInternal;
    private _cm: CueMol;
    private _gfx_mgr: GfxManager | null = null;
    private _objSlot: { [key: string]: any } = {};
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

    register(name: string, fn: ServiceFn): void {
        if (name in this._registered) {
            log.warn(`WorkerService.register: overwriting "${name}"`);
        }
        this._registered[name] = fn;
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
        if (method in this._methods) {
            try {
                const result = this._methods[method].apply(this, args);
                if (Array.isArray(result)) {
                    this._postMessage([method, seqno, true, ...result]);
                } else {
                    this._postMessage([method, seqno, true, result]);
                }
            } catch (e) {
                log.error(`Worker> call method failed: ${method},`, e);
                this._postMessage([method, seqno, false, e]);
            }
        } else if (method in this._registered) {
            Promise.resolve()
                .then(() => this._registered[method](this._buildContext(), args[0]))
                .then((result) => this._postMessage([method, seqno, true, result]))
                .catch((e) => this._postMessage([method, seqno, false, String(e)]));
        } else {
            log.error(`Worker> unknown method: ${method}`);
            this._postMessage([method, seqno, false]);
        }
    }

    private toObjTuple(obj: any, clsName?: string): ObjTuple | any {
        if (obj && typeof obj === 'object' && 'toObjID' in obj) {
            // log.info('Worker> toObjTuple result is a native object, create wrapper');
        } else {
            // log.info(`Worker> toObjTuple result is a primitive value, return directly: ${obj}`);
            return obj;
        }

        const slot_id = obj.toObjID();
        if (!(slot_id in this._objSlot)) {
            this._objSlot[slot_id.toString()] = obj;
        } else {
            // log.info(`Worker> toObjTuple: obj already has slot, slot_id=${slot_id}`);
        }

        // log.info(`Worker> toObjTuple OK, slot_id=${slot_id}, obj=`, obj);
        if (clsName) {
            return new ObjTuple(slot_id, clsName);
        } else {
            return new ObjTuple(slot_id, obj.getClassName());
        }
    }

    private lookupNativeByObjTuple(obj: any): any {
        if (!isObjTuple(obj)) {
            return obj;
        }
        const objTuple = obj as ObjTuple;
        const slot_id = objTuple._obj_id;
        if (!(slot_id in this._objSlot)) {
            log.error(`Worker> lookupNativeByObjTuple failed: invalid slot_id: ${slot_id}`);
            return null;
        }
        return this._objSlot[slot_id];
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

        // TODO: removeListener ??
        this._evtMgr.append("renderText", event.SEM_EXTND, event.SEM_OTHER, event.SEM_ANY);
        this._evtMgr.addListener((...args: any[]) => {
            const category = args[1];
            if (category === "renderText") {
                // Handle synchronously in the Worker thread using OffscreenCanvas 2D.
                // The native TextRender object cannot be transferred via postMessage.
                const trObj = args[5];
                this.handleRenderText(trObj);
                return;
            }
            try {
                this._postMessage(['event-notify', ...args]);
            } catch (e) {
                log.error('Worker> event manager notify failed:', e);
            }
        });

        return true;
    }

    loadUserStyle(userStylePath?: string): boolean {
        const stylem = this._cm.getService('StyleManager') as StyleManager;
        if (stylem === null) {
            log.error('Worker> StyleManager unavailable; skip user style');
            return false;
        }
        try {
            if (userStylePath) {
                log.info(`Worker> loading user style file: ${userStylePath}`);
                stylem.loadStyleSetFromFile(0, userStylePath, false);
            } else {
                log.info('Worker> user style absent; createStyleSet("user", 0)');
                stylem.createStyleSet('user', 0);
            }
            return true;
        } catch (e) {
            log.warn('Worker> user style load failed, fallback to createStyleSet:', e);
            try {
                stylem.createStyleSet('user', 0);
                return true;
            } catch (e2) {
                log.error('Worker> createStyleSet fallback also failed:', e2);
                return false;
            }
        }
    }

    setViewInputConfigStyle(styleName: string): boolean {
        const vic = this._cm.getService('ViewInputConfig') as ViewInputConfig;
        if (vic === null) {
            log.error('Worker> ViewInputConfig unavailable; skip style set');
            return false;
        }
        try {
            vic.style = styleName;
            log.info(`Worker> ViewInputConfig.style = ${styleName}`);
            return true;
        } catch (e) {
            log.error('Worker> ViewInputConfig.style set failed:', e);
            return false;
        }
    }

    terminateWorker(): void {
        log.info('Worker> terminateWorker called');
        this._close();
    }

    //////////

    private _rpcCreateObj(className: string): ObjTuple | null {
        // log.info(`Worker> _rpcCreateObj called, className=${className}`);
        const obj = this._internal.createObj(className);
        if (obj === null) {
            log.error(`Worker> _rpcCreateObj failed for class: ${className}`);
            return null;
        }
        // log.info('Worker> _rpcCreateObj result:', obj.toString());
        return this.toObjTuple(obj, className);
    }

    private _rpcGetService(className: string): ObjTuple | null {
        // log.info(`Worker> _rpcGetService called: ${className}`);
        const obj = this._internal.getService(className);
        if (obj === null) {
            log.error(`Worker> _rpcGetService failed for class: ${className}`);
            return null;
        }
        // log.info('Worker> _rpcGetService result:', obj.toString());
        return this.toObjTuple(obj, className);
    }

    private _rpcHasClass(className: string): boolean {
        return this._cm.hasClass(className);
    }

    private _rpcGetAllClassNamesJSON(): string {
        return this._cm.getAllClassNamesJSON();
    }

    private _rpcGetProp(thisobj: ObjTuple, propName: string): any {
        const native = this.lookupNativeByObjTuple(thisobj);
        if (native === null) {
            log.error(`Worker> _rpcGetProp failed: could not resolve thisobj=${thisobj}, propName=${propName}`);
            return null;
        }
        const wrapper = this._cm.createWrapper(native)!;
        const rval = wrapper.getProp(propName);
        return this.toObjTuple(rval);
    }

    private _rpcSetProp(thisobj: ObjTuple, propName: string, value: any): boolean {
        const native = this.lookupNativeByObjTuple(thisobj);
        if (native === null) {
            log.error(`Worker> _rpcSetProp failed: could not resolve thisobj=${thisobj}, propName=${propName}, value=${value}`);
            return false;
        }
        const resolvedValue = this.lookupNativeByObjTuple(value);
        const wrapper = this._cm.createWrapper(native)!;
        wrapper.setProp(propName, resolvedValue);
        return true;
    }

    private _rpcInvokeMethod(methodName: string, thisobj: ObjTuple, args: any[]): any {
        const native = this.lookupNativeByObjTuple(thisobj);
        if (native === null) {
            log.error('Worker> _rpcInvokeMethod failed: could not resolve thisobj');
            return null;
        }
        const resolvedArgs = args.map(arg => this.lookupNativeByObjTuple(arg));
        const wrapper = this._cm.createWrapper(native)!;
        const rval = wrapper.invokeMethod(methodName, ...resolvedArgs);
        return this.toObjTuple(rval);
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

    mouseDown(view_id: number, event: any): void {
        const view = this._sceMgr!.getView(view_id) as GUIView;
        const modif = makeModif(event);
        view.onMouseDown(event.offsetX, event.offsetY, event.screenX, event.screenY, modif);
    }

    mouseUp(view_id: number, event: any): void {
        const view = this._sceMgr!.getView(view_id) as GUIView;
        // For mouseup, event.buttons=0 (already released); use event.button (0=left,1=middle,2=right)
        const buttonMap: number[] = [1, 2, 4];
        let modif = buttonMap[event.button] ?? 0;
        if (event.ctrlKey) modif += 32;
        if (event.shiftKey) modif += 64;
        view.onMouseUp(event.offsetX, event.offsetY, event.screenX, event.screenY, modif);
    }

    private handleRenderText(trNative: any): void {
        const tr = this._cm.createWrapper(trNative) as TextImgBuf;
        const text: string = tr.text;
        const fontstr: string = tr.font;
        const h: number = tr.height;

        // Measure text width using a temporary OffscreenCanvas
        const tmpCanvas = new OffscreenCanvas(1, 1);
        const tmpCtx = tmpCanvas.getContext('2d')!;
        tmpCtx.font = fontstr;
        const metrics = tmpCtx.measureText(text);
        let w = Math.ceil(metrics.width);
        // Align to 4-byte boundary (same as cuemol2 reference implementation)
        if (w % 4 !== 0) w += (4 - w % 4);

        // Render text onto a properly-sized OffscreenCanvas
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext('2d')!;
        ctx.font = fontstr;
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'white';
        ctx.fillText(text, 0, h);

        // Extract alpha channel values and write back to the native C++ TextRender object
        const img = ctx.getImageData(0, 0, w, h);
        const size = w * h;

        tr.width = w;
        tr.resize(size);

        // Wrap img.data (Uint8ClampedArray, RGBA) as a Uint8Array view (zero-copy),
        // then pass to C++ as a ByteArray for bulk alpha extraction — avoids N JS→C++ calls.
        const rgbaView = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
        const ba = this._cm.fromTypedArray(rgbaView) as ByteArray;
        tr.setDataFromRGBA(ba);
    }

    mouseMove(view_id: number, event: any): void {
        if (PERF_MEASURE) perfCounters.mouseMoveCount++;
        const view = this._sceMgr!.getView(view_id) as GUIView;
        const modif = makeModif(event);
        view.onMouseMove(event.offsetX, event.offsetY, event.screenX, event.screenY, modif);
    }

    gestureEvent(view_id: number, event: any): void {
        const view = this._sceMgr!.getView(view_id) as GUIView;
        let modif = 0;
        if (event.ctrlKey)  modif |= 32;
        if (event.shiftKey) modif |= 64;
        if (event.altKey)   modif |= 128;

        // Scale constants preserve the gesture feel from the pre-refactor path.
        // GES_PINCH: was deltaY*8 (PINCH_ZOOM_SCALE) then View::mouseWheel prescaled /2.5
        //   => net multiplier 8/2.5 = 3.2 into handleMouseDragImpl.
        // GES_ROTATE: was view.rotateView(0,0,-rotation*4.0); handleMouseDragImpl for
        //   VIEW_ROTZ applies delta/4.0 => send delta_rotate=-rotation*16 to yield -rotation*4.
        const GES_PINCH  = 6;
        const GES_ROTATE = 7;
        let scaled = event.delta;
        if (event.axisID === GES_PINCH)  scaled = event.delta * 3.2;
        if (event.axisID === GES_ROTATE) scaled = -event.delta * 16.0;

        view.onGesture(event.offsetX, event.offsetY, event.screenX, event.screenY,
            modif, event.axisID, scaled);
    }

    wheelEvent(view_id: number, event: any): void {
        const view = this._sceMgr!.getView(view_id) as GUIView;
        // ctrl=32, shift=64, alt=128 (buttons bits 0-2 unused for wheel)
        let modif = 0;
        if (event.ctrlKey)  modif |= 32;
        if (event.shiftKey) modif |= 64;
        if (event.altKey)   modif |= 128;

        view.onWheel(event.offsetX, event.offsetY, event.screenX, event.screenY,
            modif, event.deltaX, event.deltaY);
    }

}

