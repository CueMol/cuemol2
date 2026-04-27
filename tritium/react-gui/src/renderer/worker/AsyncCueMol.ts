import { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import { wrapper_map } from '@cuemol/core/src/wrappers/wrapper-loader';
import type { FileOpenOptions, RendererOptions } from '../components/fopen-opt-dlgs/types';
import type { StreamManager } from '@cuemol/core/src/wrappers/StreamManager';
import { ObjTuple } from './ObjTuple';
import { ObjProxy } from './ObjProxy';
import { asAsync } from './asyncUtils';

// import { createLogger } from "@cuemol/core/src/logger";
// const log = createLogger(import.meta.url);
const log = console;

const RENDERER_TEST_TYPES = new Set(['ms2test', 'symm']);

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

    // Fire-and-forget: send postMessage without registering a Promise listener.
    // Used by pipelining paths (invokeMethodObj, invokeMethodVoid, getPropObj, setProp).
    postPipelined(method: string, seq: number, args: any[]): void {
        this._worker.postMessage([method, seq, ...args]);
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
            this.sceMgr = await this.getService('SceneManager');
            this.cmdMgr = await this.getService('CmdMgr');
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
        const rval = await this.createObj("PaintColoring");
        rval.append(await this.makeSel("sheet"), await this.makeColor("SteelBlue"));
        rval.append(await this.makeSel("helix"), await this.makeColor("khaki"));
        rval.append(await this.makeSel("nucleic"), await this.makeColor("yellow"));
        rval.append(await this.makeSel("*"), await this.makeColor("FloralWhite"));
        return rval;
    };

    // Map renderer type to default style preset names.
    // Ported from uxp_gui/cuemol2/base/content/renderer.js:59-96 (setDefaultStyles).
    getDefaultStyleName(rendererType: string): string {
        switch (rendererType) {
            case 'tube':
            case 'spline':
                return 'DefaultHSCPaint';
            case 'ribbon':
                return 'DefaultRibbon,DefaultHSCPaint';
            case 'cartoon':
                return 'DefaultCartoon,DefaultHSCPaint';
            case 'nucl':
                return 'DefaultNucl';
            case 'anisou':
                return 'DefaultAnIsoU,DefaultCPKColoring';
            case 'ballstick':
                return 'DefaultBallStick,DefaultCPKColoring';
            case 'cpk':
                return 'DefaultCPK,DefaultCPKColoring';
            case 'contour':
                return 'DefaultContour';
            case 'isosurf':
                return 'DefaultIsoSurf';
            default:
                return 'DefaultCPKColoring';
        }
    }

    // Post-process a newly created molecule renderer.
    // Ported from uxp_gui/cuemol2/base/content/renderer.js:30-57 (molPostProc)
    // and cuemol2-utils.js:123-128 (autoCreateSelRend).
    async molPostProc(mol: any, _rend: any, newObj: boolean): Promise<void> {
        try {
            const selRend = await mol.getRendererByType('*selection');
            if (!selRend) {
                await mol.createRenderer('*selection');
            }
        } catch (e) {
            log.warn('autoCreateSelRend failed:', e);
        }

        if (newObj) {
            try {
                const coloring = await this.createDefPaintColoring();
                mol.coloring = coloring;
                log.info("*** default paint coloring set");
            } catch (e) {
                log.warn('set default paint coloring failed:', e);
            }
        }
        // TODO: disorder renderer target wiring (requires getRendNameList helper).
    }

    // Set up a renderer for a freshly loaded object.
    // Ported from uxp_gui/cuemol2/base/content/renderer.js:135-209 (doSetupRend).
    async setupRenderer(mol: any, rendOpts: RendererOptions): Promise<void> {
        // TODO: preset renderer (createPresetRenderer) support — currently the
        //       dialog never returns a *RendPreset type.
        const cmd = await this.cmdMgr.getCmd('new_renderer');
        cmd.target_object = mol;
        cmd.renderer_type = rendOpts.rendererType;
        cmd.renderer_name = rendOpts.rendererName;
        cmd.recenter_view = rendOpts.centerView;
        cmd.default_style_name = this.getDefaultStyleName(rendOpts.rendererType);
        await cmd.run();
        const rend = await cmd.result_renderer;
        log.info('renderer created: rend=', rend);

        // molPostProc + selection both apply only to MolCoord-derived classes,
        // whose renderers carry a 'sel' property (SelCommand object, not string).
        const className = mol.getClassName();
        const nonMolClasses = ['ElePotMap', 'MolSurfObj', 'DensityMap'];
        if (!nonMolClasses.includes(className)) {
            await this.molPostProc(mol, rend, true);

            // Skip '*' (default/select-all — no-op) and empty.
            if (rendOpts.selection && rendOpts.selection !== '' && rendOpts.selection !== '*') {
                const sel = await this.makeSel(rendOpts.selection);
                if (sel) {
                    rend.sel = sel;
                } else {
                    log.warn(`selection compile failed: ${rendOpts.selection}`);
                }
            }
        }
    }

    async getCompatibleRendererNames(filePath: string): Promise<string[]> {
        try {
            const strMgr = await this.getService('StreamManager') as StreamManager;
            if (!strMgr) return [];

            const infoJson = await asAsync(strMgr.getInfoJSON2());
            const info: Array<{ name: string; fext: string; category: number }> = JSON.parse(infoJson);

            const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
            const readerEntry = info.find(
                (e) => e.category === 0 &&
                    e.fext.split(';').map((s) => s.trim().replace(/^\*\./, '').toLowerCase()).includes(ext)
            );
            if (!readerEntry) return [];

            const reader = await strMgr.createHandler(readerEntry.name, 0);
            if (!reader) return [];
            await asAsync((reader as any).setPath(filePath));

            const tmpObj = await (reader as any).createDefaultObj();
            if (!tmpObj) return [];

            const rendTypesStr = await asAsync(tmpObj.searchCompatibleRendererNames());
            if (!rendTypesStr) return [];

            return rendTypesStr
                .split(',')
                .map((s: string) => s.trim())
                .filter((s: string) => s.length > 0 && s.charAt(0) !== '*' && !RENDERER_TEST_TYPES.has(s));
        } catch (e) {
            log.warn('getCompatibleRendererNames failed:', e);
            return [];
        }
    }

    async loadScene(filePath: string, scene_id: number): Promise<boolean> {
        log.info(`loading QSC scene: ${filePath}`);
        const scene = await this.sceMgr.getScene(scene_id);
        const cmd = await this.cmdMgr.getCmd('load_scene');
        cmd.target_scene = scene;
        cmd.file_path = filePath;
        cmd.set_camera = true;
        await cmd.run();
        return true;
    }

    async loadObject(filePath: string, scene_id: number,
                     options: FileOpenOptions): Promise<boolean> {
        log.info(`loading object file: ${filePath}`);
        const scene = await this.sceMgr.getScene(scene_id);
        const cmd = await this.cmdMgr.getCmd('load_object');
        cmd.target_scene = scene;
        cmd.file_path = filePath;
        // TODO: format-specific reader options (options.format.options) are NOT
        //       applied yet — LoadObjectCommand (C++) has no reader option field.
        //       For now, log and discard.
        if (options.format.kind !== 'unknown') {
            log.info(`loadObject: format=${options.format.kind} options dropped (not wired to C++)`);
        }
        await cmd.run();
        const mol = await cmd.result_object;

        if (options.renderer.objectName) {
            mol.name = options.renderer.objectName;
        }
        await this.setupRenderer(mol, options.renderer);
        return true;
    }
}
