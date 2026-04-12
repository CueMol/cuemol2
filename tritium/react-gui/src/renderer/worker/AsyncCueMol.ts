import { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import { wrapper_map } from '@cuemol/core/src/wrappers/wrapper-loader';
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
    private sceMgr: any;
    private cmdMgr: any;

    constructor() {
        log.info('launch worker...');

        this._worker = new Worker(new URL('./worker_launcher.ts', import.meta.url));

        log.info('launch worker OK');

        this._worker.onmessage = (event: MessageEvent) => {
            // log.info('worker message received: %s', event);
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
        // log.debug('postMessage called: %s %s %s, xfer: %s', method, seq, args, xfer);
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

    async invokeWorker(method: string, ...args: any[]): Promise<any[]> {
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
        // log.info('createWrapper called for obj: %s', obj);
        const className = obj.getClassName();
        // log.info('createWrapper called for class: %s', className);
        const Klass = wrapper_map[className];
        const wrapper = new Klass(obj, this);
        return wrapper;
    }

    async createWrapper(prom: Promise<ObjProxy>): Promise<BaseWrapper | null> {
        // log.info('createWrapper called for Promise: %s', prom);
        return prom.then((resolvedObj: any) => {
            // log.info('Promise resolved for obj: %s', resolvedObj);
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
        log.info('initCueMol sysConfigPath=<%s>', sysConfigPath);

        try {
            await this.invokeWorker('initCueMol', sysConfigPath);
            log.info('initCueMol OK');
            this.sceMgr = await this.getService('SceneManager');
            this.cmdMgr = await this.getService('CmdMgr');
        } catch (e) {
            log.error('initCueMol failed: %s', e);
        }
    }

    async terminateWorker(): Promise<void> {
        try {
            await this.invokeWorker('terminateWorker');
            log.info('terminateWorker OK');
            this._worker.terminate();
            this._ready = false;
        } catch (e) {
            log.error('terminateWorker failed: %s', e);
        }
    }

    async createObj(className: string): Promise<BaseWrapper | null> {
        try {
            const result = await this.invokeWorker('createObj', className);
            if (result === null) {
                log.warn('createObj failed for class: %s', className);
                return null;
            }
            // log.info('createObj OK, result=', result);
            const obj_id = result[0]._obj_id;
            const natObj = new ObjProxy(obj_id, className, this);
            return this.createWrapperImpl(natObj);
        } catch (e) {
            log.error('createObj failed: %s', e);
        }
        return null;
    }

    async getService(className: string): Promise<BaseWrapper | null> {
        try {
            const result = await this.invokeWorker('getService', className);
            if (result === null) {
                log.warn('getService failed for class: %s', className);
                return null;
            }
            // log.info('createObj OK, result=', result);
            const obj_id = result[0]._obj_id;
            const natObj = new ObjProxy(obj_id, className, this);
            return this.createWrapperImpl(natObj);
        } catch (e) {
            log.error('getService failed: %s', e);
        }
        return null;

        // const obj = this.internal.getService(className);
        // return this.createWrapper(obj as NativeObject);
    }

    async hasClass(className: string): Promise<boolean | null> {
        try {
            const result = await this.invokeWorker('hasClass', className);
            if (result === null) {
                log.warn('hasClass failed for class: %s', className);
                return null;
            }
            return result[0] as boolean;
        } catch (e) {
            log.error('hasClass failed: %s', e);
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
            log.error('getAllClassNamesJSON failed: %s', e);
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
            log.warn('addView failed for view_id: %s', view_id);
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

    //////////

    async makeSel(selstr: string, uid: number = 0): Promise<any> {
        let sel = await this.createObj("SelCommand");
        if (selstr && sel) {
            if (uid) {
                if (!sel.compile(selstr, uid))
                    return null;
            }
            else {
                if (!sel.compile(selstr, 0))
                    return null;
            }
        }
        return sel;
    }

    async makeColor(str: string, uid: number = 0): Promise<any> {
        let stylem = await this.getService("StyleManager");
        let color = null;
        if (uid) {
            color = stylem.compileColor(str, uid);
        }
        else {
            color = stylem.compileColor(str, 0);
        }
        return color;
    };

    async createDefPaintColoring(): Promise<any> {
        // dd("===== createDefPaintColoring called!!");
        let rval = await this.createObj("PaintColoring");
        rval.append(this.makeSel("sheet"), this.makeColor("SteelBlue"));
        rval.append(this.makeSel("helix"), this.makeColor("khaki"));
        rval.append(this.makeSel("nucleic"), this.makeColor("yellow"));
        rval.append(this.makeSel("*"), this.makeColor("FloralWhite"));
        return rval;
    };

    async loadFile(filePath: string, scene_id: number, _view_id: number): Promise<boolean> {
        const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
        const scene = await this.sceMgr.getScene(scene_id);

        if (ext === 'qsc') {
            log.info('loading QSC scene: %s', filePath);
            const cmd = await this.cmdMgr.getCmd('load_scene');
            cmd.target_scene = scene;
            cmd.file_path = filePath;
            cmd.set_camera = true;
            await cmd.run();
            return true;
        }

        const objectExts = ['pdb', 'cif', 'mol2', 'sdf'];
        if (objectExts.includes(ext)) {
            log.info('loading object file: %s', filePath);
            const cmd = await this.cmdMgr.getCmd('load_object');
            cmd.target_scene = scene;
            cmd.file_path = filePath;
            if (ext === 'pdb') {
                cmd.options = { build2ndry: true };
            }
            await cmd.run();
            const mol = await cmd.result_object;

            const new_rend = await this.cmdMgr.getCmd('new_renderer');
            new_rend.target_object = mol;
            new_rend.renderer_type = 'ballstick';
            new_rend.renderer_name = 'simple1';
            new_rend.recenter_view = true;
            new_rend.default_style_name = 'DefaultCPKColoring';
            await new_rend.run();

            return true;
        }

        log.warn('unsupported file extension: %s', ext);
        return false;
    }
}    
