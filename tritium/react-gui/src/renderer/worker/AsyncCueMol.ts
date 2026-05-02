import { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import { wrapper_map } from '@cuemol/core/src/wrappers/wrapper-loader';
import type { FileOpenOptions } from '../components/fopen-opt-dlgs/types';
import { ObjTuple } from './ObjTuple';
import { ObjProxy } from './ObjProxy';

// import { createLogger } from "@cuemol/core/src/logger";
// const log = createLogger(import.meta.url);
const log = console;

function makeMethodSeq(method: string, seqno: number): string {
    return method + '.' + seqno.toString();
}

export class AsyncCueMol {
    private _ready: boolean = false;
    private _seqno: number = 0;
    private _worker: Worker;
    private _worker_onmessage_dict: { [key: string]: any } = {};
    private _slot: { [key: string]: any } = {};
    private _pendingCount: number = 0;
    private _busyListeners: Set<(busy: boolean) => void> = new Set();

    constructor() {
        log.info('launch worker...');

        this._worker = new Worker(new URL('./worker_launcher.ts', import.meta.url));

        log.info('launch worker OK');

        this._worker.onmessage = (event: MessageEvent) => {
            // log.info('worker message received:', event);
            const [method, seqno, ...args] = event.data;

            if (method === 'event-notify') {
                // const [, ...evtargs] = event.data;
                const evtargs = event.data.slice(1) as [number, string, number, number, number, string];
                try {
                    this.eventNotify(...evtargs);
                } catch (e) {
                    log.info('event manager notify failed:', e);
                }
                return;
            }

            const method_seq = makeMethodSeq(method, seqno);
            if (method_seq in this._worker_onmessage_dict) {
                this._worker_onmessage_dict[method_seq].apply(this, args);
                delete this._worker_onmessage_dict[method_seq];
            }
        };

        this._ready = true;
    }

    isReady(): boolean {
        return this._ready;
    }

    postMessage(method: string, seq: number, args: any[], xfer: any = null) {
        // log.debug(`postMessage called: ${method} ${seq}`, args, 'xfer:', xfer);
        if (xfer === null)
            this._worker.postMessage([method, seq, ...args]);
        else
            this._worker.postMessage([method, seq, ...args], [xfer]);
    }

    getSeqNo(): number {
        this._seqno++;
        return this._seqno;
    }

    addListener(method: string, seqno: number, handler: any): void {
        const method_seq = makeMethodSeq(method, seqno);
        this._worker_onmessage_dict[method_seq] = handler;
    }

    private _incPending(): void {
        const wasBusy = this._pendingCount > 0;
        this._pendingCount++;
        if (!wasBusy) this._notifyBusyChange(true);
    }

    private _decPending(): void {
        if (this._pendingCount <= 0) return;
        this._pendingCount--;
        if (this._pendingCount === 0) this._notifyBusyChange(false);
    }

    private _notifyBusyChange(busy: boolean): void {
        for (const cb of this._busyListeners) {
            try { cb(busy); } catch (e) { log.warn('busy listener error:', e); }
        }
    }

    isBusy(): boolean { return this._pendingCount > 0; }

    subscribeBusy(cb: (busy: boolean) => void): () => void {
        this._busyListeners.add(cb);
        return () => { this._busyListeners.delete(cb); };
    }

    async invokeWorker(method: string, ...args: any[]): Promise<any[]> {
        const cur_seq = this.getSeqNo();
        this._incPending();
        let promise = new Promise<any[]>((resolve, reject) => {
            this.addListener(method, cur_seq, (result: boolean, ...msgargs: any[]): void => {
                try {
                    if (result) {
                        // log.info('invokeWorker OK:', method, 'msgargs:', msgargs);
                        resolve(msgargs);
                    } else {
                        // log.info('invokeWorker error:', method, 'error:', msgargs[0]);
                        reject(msgargs[0]);
                    }
                } finally {
                    this._decPending();
                }
            });
        });
        // send invokeWorker message to worker thread
        this.postMessage(method, cur_seq, args);
        return promise;
    }

    async invokeWorkerWithTransfer(method: string, transfer: any, ...args: any[]): Promise<any[]> {
        const cur_seq = this.getSeqNo();
        let promise = new Promise<any[]>((resolve, reject) => {
            this.addListener(method, cur_seq, (result: boolean, ...msgargs: any[]): void => {
                if (result) {
                    // log.info('invokeWorker OK:', method, 'msgargs:', msgargs);
                    resolve(msgargs);
                } else {
                    // log.info('invokeWorker error:', method, 'error:', msgargs[0]);
                    reject(msgargs[0]);
                }
            });
        });
        // send invokeWorker message to worker thread
        this.postMessage(method, cur_seq, args, transfer);
        return promise;
    }

    //////////

    createWrapperImpl(obj: ObjProxy): BaseWrapper {
        // log.info('createWrapper called for obj:', obj);
        const className = obj.getClassName();
        // log.info(`createWrapper called for class: ${className}`);
        const Klass = wrapper_map[className];
        const wrapper = new Klass(obj, this);
        return wrapper;
    }

    async createWrapper(prom: Promise<ObjProxy>): Promise<BaseWrapper | null> {
        // log.info('createWrapper called for Promise:', prom);
        return prom.then((resolvedObj: any) => {
            if (resolvedObj === null || resolvedObj === undefined) {
                return null;
            }
            // log.info('Promise resolved for obj:', resolvedObj);
            return this.createWrapperImpl(resolvedObj);
        }).catch((e: any) => {
            log.warn('Error resolving Promise for obj:', e);
            return null;
        });
    }

    getWrapped(obj: ObjProxy): ObjTuple {
        return obj.getObjTuple();
    }

    //////////

    async initCueMol(sysConfigPath?: string): Promise<void> {
        log.info(`initCueMol sysConfigPath=<${sysConfigPath}>`);

        try {
            await this.invokeWorker('initCueMol', sysConfigPath);
            log.info('initCueMol OK');
        } catch (e) {
            log.error('initCueMol failed:', e);
        }
    }

    async loadUserStyle(userStylePath?: string): Promise<boolean> {
        try {
            const result = await this.invokeWorker('loadUserStyle', userStylePath);
            return result[0] as boolean;
        } catch (e) {
            log.error('loadUserStyle failed:', e);
            return false;
        }
    }

    async setViewInputConfigStyle(styleName: string): Promise<boolean> {
        try {
            const result = await this.invokeWorker('setViewInputConfigStyle', styleName);
            return result[0] as boolean;
        } catch (e) {
            log.error('setViewInputConfigStyle failed:', e);
            return false;
        }
    }

    async terminateWorker(): Promise<void> {
        try {
            await this.invokeWorker('terminateWorker');
            log.info('terminateWorker OK');
            this._worker.terminate();
            this._ready = false;
        } catch (e) {
            log.error('terminateWorker failed:', e);
        }
    }

    async createObj(className: string): Promise<BaseWrapper | null> {
        try {
            const result = await this.invokeWorker('createObj', className);
            if (result === null) {
                log.warn(`createObj failed for class: ${className}`);
                return null;
            }
            // log.info('createObj OK, result=', result);
            const obj_id = result[0]._obj_id;
            const natObj = new ObjProxy(obj_id, className, this);
            return this.createWrapperImpl(natObj);
        } catch (e) {
            log.error('createObj failed:', e);
        }
        return null;
    }

    async getService(className: string): Promise<BaseWrapper | null> {
        try {
            const result = await this.invokeWorker('getService', className);
            if (result === null) {
                log.warn(`getService failed for class: ${className}`);
                return null;
            }
            // log.info('createObj OK, result=', result);
            const obj_id = result[0]._obj_id;
            const natObj = new ObjProxy(obj_id, className, this);
            return this.createWrapperImpl(natObj);
        } catch (e) {
            log.error('getService failed:', e);
        }
        return null;

        // const obj = this.internal.getService(className);
        // return this.createWrapper(obj as NativeObject);
    }

    async hasClass(className: string): Promise<boolean | null> {
        try {
            const result = await this.invokeWorker('hasClass', className);
            if (result === null) {
                log.warn(`hasClass failed for class: ${className}`);
                return null;
            }
            return result[0] as boolean;
        } catch (e) {
            log.error('hasClass failed:', e);
        }
        return null;
    }

    async getAllClassNamesJSON(): Promise<string | null> {
        try {
            const result = await this.invokeWorker('getAllClassNamesJSON');
            if (result === null) {
                log.warn('getAllClassNamesJSON failed');
                return null;
            }
            return result[0] as string;
        } catch (e) {
            log.error('getAllClassNamesJSON failed:', e);
        }
        return null;
    }

    //////////
    // Canvas binding

    async bindCanvas(canvas: any, view_id: number, dpr: number): Promise<any[]> {
        const offscreen = canvas.transferControlToOffscreen();
        return await this.invokeWorkerWithTransfer('bindCanvas',
            offscreen,
            offscreen,
            view_id,
            dpr);
    }

    async addView(view_id: number, dpr: number): Promise<boolean> {
        const result = await this.invokeWorker('addView', view_id, dpr);
        if (result === null) {
            log.warn(`addView failed for view_id: ${view_id}`);
            return false;
        }
        return result[0] as boolean;
    }

    async activateView(view_id: number): Promise<void> {
        await this.invokeWorker('activateView', view_id);
    }

    async removeView(view_id: number): Promise<void> {
        await this.invokeWorker('removeView', view_id);
    }

    resized(view_id: number, w: number, h: number, dpr: number): void {
        const cur_seq = this.getSeqNo();
        this.postMessage('resized', cur_seq, [view_id, w, h, dpr]);
    }

    onMouseEvent(view_id: number, method: string, event: any): void {
        const { clientX, clientY, screenX, screenY, offsetX, offsetY, buttons, button, ctrlKey, shiftKey } = event;
        const ev = { clientX, clientY, screenX, screenY, offsetX, offsetY, buttons, button, ctrlKey, shiftKey };
        const cur_seq = this.getSeqNo();
        this.postMessage(method, cur_seq, [view_id, ev]);
    }

    onWheelEvent(view_id: number, event: any): void {
        const { offsetX, offsetY, screenX, screenY, deltaX, deltaY, ctrlKey, shiftKey, altKey } = event;
        const ev = { offsetX, offsetY, screenX, screenY, deltaX, deltaY, ctrlKey, shiftKey, altKey };
        const cur_seq = this.getSeqNo();
        this.postMessage('wheel', cur_seq, [view_id, ev]);
    }

    onGestureEvent(view_id: number, axisID: number, delta: number, event?: any): void {
        const { offsetX = 0, offsetY = 0, screenX = 0, screenY = 0,
                ctrlKey = false, shiftKey = false, altKey = false } = event ?? {};
        const ev = { offsetX, offsetY, screenX, screenY, ctrlKey, shiftKey, altKey, axisID, delta };
        const cur_seq = this.getSeqNo();
        this.postMessage('gesture', cur_seq, [view_id, ev]);
    }

    //////////
    // Event impl

    async addEventListener(aCatStr: string,
        aSrcType: number,
        aEvtType: number,
        aSrcID: number, aObs: any): Promise<number> {
        const [slot_id,]: [number, any] = await this.invokeWorker('addEventListener',
            aCatStr, aSrcType, aEvtType, aSrcID) as [number, any];
        log.info("event listener registered: <" + aCatStr + ">, id=" + slot_id);
        this._slot[slot_id.toString()] = aObs;
        return slot_id;
    }

    async removeEventListener(nID: number): Promise<void> {
        await this.invokeWorker('removeEventListener', nID);
        delete this._slot[nID.toString()];
        log.info("EventManager, unload slot: " + nID);
    }

    eventNotify(slot: number,
        category: string,
        srcCat: number,
        evtType: number,
        srcUID: number,
        evtStr: string): any {
        let json: string | null = null;
        let jobj: any = null;

        // console.log('notify called:', slot, category, srcCat, evtType, srcUID, evtStr);

        if (typeof evtStr === 'string') {
            json = evtStr;
            if (json && json.length > 0)
                jobj = JSON.parse(json);
            else
                jobj = new Object();
        }
        else {
            // TODO: impl??
            // let cm = require("cuemol");
            // jobj = cm.convPolymObj(evtStr);
            // dd("Event notify arg4=obj, "+jobj);
            console.log('unknown evtStr type', evtStr);
        }

        const dict_args = {
            method: category,
            srcCat: srcCat,
            evtType: evtType,
            srcUID: srcUID,
            obj: jobj,
            // raw: args,
        };

        const strslot = slot.toString();
        if (strslot in this._slot) {
            const obs = this._slot[strslot];
            if (typeof obs === "function")
                return obs(dict_args);
            else if ("notify" in obs && typeof obs.notify === "function")
                return obs.notify(dict_args);
            else
                console.log("warning : event for slot " + strslot + " is not delivered!!");
        }
        return null;
    }

    async getCompatibleRendererNames(filePath: string): Promise<string[]> {
        try {
            const result = await this.invokeWorker('getCompatibleRendererNames', { filePath });
            return result?.[0] ?? [];
        } catch (e) {
            log.warn('getCompatibleRendererNames failed:', e);
            return [];
        }
    }

    async getOpenFilters(catId: number): Promise<ElectronFileFilter[]> {
        try {
            const result = await this.invokeWorker('getOpenFilters', { catId });
            return result?.[0] ?? [];
        } catch (e) {
            log.warn('getOpenFilters failed:', e);
            return [];
        }
    }

    async createNewSceneAndView(dpr: number): Promise<{ scene_uid: number; view_uid: number } | null> {
        try {
            const result = await this.invokeWorker('createNewSceneAndView', { dpr });
            return result?.[0] ?? null;
        } catch (e) {
            log.error('createNewSceneAndView failed:', e);
            return null;
        }
    }

    async loadScene(filePath: string, scene_id: number): Promise<boolean> {
        log.info(`loading QSC scene: ${filePath}`);
        const result = await this.invokeWorker('loadScene', { filePath, sceneId: scene_id });
        return result?.[0]?.ok ?? true;
    }

    async loadObject(filePath: string, scene_id: number,
                     options: FileOpenOptions): Promise<boolean> {
        log.info(`loading object file: ${filePath}`);
        const result = await this.invokeWorker('loadObject', { filePath, sceneId: scene_id, options });
        return result?.[0]?.ok ?? true;
    }

    async undo(scene_id: number, depth = 0): Promise<boolean> {
        const result = await this.invokeWorker('undo', { sceneId: scene_id, depth });
        return result?.[0]?.ok ?? false;
    }

    async redo(scene_id: number, depth = 0): Promise<boolean> {
        const result = await this.invokeWorker('redo', { sceneId: scene_id, depth });
        return result?.[0]?.ok ?? false;
    }

    //////////
    // Navigation tool services

    async naviHitTest(args: { viewId: number; x: number; y: number }): Promise<{ hit: boolean; raw?: any } | null> {
        const result = await this.invokeWorker('naviHitTest', args);
        return result?.[0] ?? null;
    }

    async naviClickAtom(args: { viewId: number; x: number; y: number }): Promise<{ handled: boolean; statusMessage?: string; hitres?: any } | null> {
        const result = await this.invokeWorker('naviClickAtom', args);
        return result?.[0] ?? null;
    }

    async naviResidSel(args: {
        viewId: number; x: number; y: number;
        mode: 'toggle' | 'extend';
        prevObjId?: number; prevAtomId?: number;
    }): Promise<{ handled: boolean; objId?: number; atomId?: number } | null> {
        const result = await this.invokeWorker('naviResidSel', args);
        return result?.[0] ?? null;
    }

    async naviCenterAt(args: { viewId: number; x: number; y: number; z: number }): Promise<{ ok: boolean } | null> {
        const result = await this.invokeWorker('naviCenterAt', args);
        return result?.[0] ?? null;
    }

    async naviCenterAtSymm(args: {
        viewId: number; objId: number; rendId: number; atomId: number; symmId: number;
    }): Promise<{ ok: boolean } | null> {
        const result = await this.invokeWorker('naviCenterAtSymm', args);
        return result?.[0] ?? null;
    }

    async naviCtxSelect(args: {
        viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol';
    }): Promise<{ ok: boolean } | null> {
        const result = await this.invokeWorker('naviCtxSelect', args);
        return result?.[0] ?? null;
    }

    async naviCtxAddSelect(args: {
        viewId: number; objId: number; atomId: number; mode: 'atom' | 'residue' | 'chain' | 'mol';
    }): Promise<{ ok: boolean } | null> {
        const result = await this.invokeWorker('naviCtxAddSelect', args);
        return result?.[0] ?? null;
    }

    async naviCtxUnselect(args: { viewId: number; objId: number }): Promise<{ ok: boolean } | null> {
        const result = await this.invokeWorker('naviCtxUnselect', args);
        return result?.[0] ?? null;
    }

    async naviCtxInvertSel(args: { viewId: number; objId: number }): Promise<{ ok: boolean } | null> {
        const result = await this.invokeWorker('naviCtxInvertSel', args);
        return result?.[0] ?? null;
    }

    async naviCtxToggleSidechain(args: { viewId: number; objId: number }): Promise<{ ok: boolean } | null> {
        const result = await this.invokeWorker('naviCtxToggleSidechain', args);
        return result?.[0] ?? null;
    }

    async naviCtxAround(args: {
        viewId: number; objId: number; distance: number; byres: boolean;
    }): Promise<{ ok: boolean } | null> {
        const result = await this.invokeWorker('naviCtxAround', args);
        return result?.[0] ?? null;
    }
}
