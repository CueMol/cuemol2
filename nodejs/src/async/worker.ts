import { parentPort } from 'worker_threads';
import bindings from 'bindings';
import type { CueMolInternal } from '../interfaces';

// NOTE: .ts extension required — Node.js ESM native TS execution
// @ts-expect-error TS5097: allowImportingTsExtensions not enabled
import { ObjTuple, isObjTuple } from './ObjTuple.ts';
// @ts-expect-error TS5097: allowImportingTsExtensions not enabled
import { createLogger } from "../logger.ts";

const log = createLogger(import.meta.url);

type ServiceMethod = (...args: any[]) => any;

class WorkerService {

    private _methods: { [key: string]: ServiceMethod };
    private _internal: CueMolInternal;
    // private sceMgr: any;
    // private evtMgr: any;
    // private cmdMgr: any;

    // private _objSeqno: number = 0;
    private _objSlot: { [key: string]: any } = {};

    constructor() {
        // Load the native addon
        this._internal = bindings('cuemol_internal.node') as CueMolInternal;
        log.info("_internal: %s", this._internal);

        this._methods = {
            'initCueMol': this.initCueMol,
            'terminateWorker': this.terminateWorker,
            'createObj': this.createObj,
            'getService': this.getService,
            'hasClass': this.hasClass,
            'getAllClassNamesJSON': this.getAllClassNamesJSON,
            'getProp': this.getProp,
            'setProp': this.setProp,
            'invokeMethod': this.invokeMethod,
        }
    }

    invoke(method: string, seqno: number, args: any[]): void {
        log.info('Worker> invoke called: %s seqno: %d args: %s', method, seqno, args);
        if (!(method in this._methods)) {
            log.error('Worker> unknown method: %s', method);
            parentPort?.postMessage([method, seqno, false]);
            return;
        }

        try {
            const result = this._methods[method].apply(this, args);
            if (Array.isArray(result)) {
                parentPort?.postMessage([method, seqno, true, ...result]);
            } else {
                parentPort?.postMessage([method, seqno, true, result]);
            }
        } catch (e) {
            log.error('Worker> call method failed: %s, %s', method, e);
            parentPort?.postMessage([method, seqno, false, e]);
            // parentPort?.postMessage([method, seqno, true]);
        }
    }

    // getSeqNo(): number {
    //     this._objSeqno++;
    //     return this._objSeqno;
    // }

    getWrapped(obj: any, clsName?:string): ObjTuple | any {
        // check whether obj is NativeObject or not, if so, create wrapper and return ObjTuple
        if (obj && typeof obj === 'object' && 'toObjID' in obj) {
            log.info('Worker> getWrapped result is a native object, create wrapper');
        }
        else {
            log.info('Worker> getWrapped result is a primitive value, return directly: %s', obj);
            return obj;
        }

        // check if obj already has slot
        const slot_id = obj.toObjID();
        if (!(slot_id in this._objSlot)) {
            this._objSlot[slot_id.toString()] = obj;
        } else {
            log.info('Worker> getWrapped: obj already has slot, slot_id=%s', slot_id);
        }

        log.info('Worker> getWrapped OK, slot_id=%s, obj=%s', slot_id, obj);
        if (clsName) {
            return new ObjTuple(slot_id, clsName);
        } else {
            return new ObjTuple(slot_id, obj.getClassName());
        }
    }

    resolveWrapped(obj: any): any {
        // check objTuple is instance of ObjTuple
        if (!isObjTuple(obj)) {
            return obj;
        }
        const objTuple = obj as ObjTuple;
        const slot_id = objTuple._obj_id;
        if (!(slot_id in this._objSlot)) {
            log.error('Worker> resolveWrapped failed: invalid slot_id: %s', slot_id);
            return null;
        }
        return this._objSlot[slot_id];
    }

    //////////

    initCueMol(loadPath?: string): boolean {
        log.info('Worker> initCueMol called, loadPath: %s', loadPath);
        if (!loadPath) {
            this._internal.initCueMol();
        } else {
            this._internal.initCueMol(loadPath);
        }

        // this.cuemol = createCueMol(load_path);
        // this._gfx_mgr = new GfxManager(this.cuemol);
        // this.sceMgr = this.cuemol.getService('SceneManager');
        // this.evtMgr = this.cuemol.getService('ScrEventManager');
        // this.cmdMgr = this.cuemol.getService('CmdMgr');

        // // TODO: removeListener ??
        // this.evtMgr.addListener((...args) => {
        //     try {
        //         postMessage(['event-notify', ...args]);
        //     } catch (e) {
        //         console.log('event manager notify failed:', e);
        //     }
        // });
        return true;
    }

    terminateWorker(): void {
        log.info('Worker> terminateWorker called');
        parentPort?.close();
    }

    createObj(className: string): ObjTuple | null {
        log.info('Worker> createObj called, className=%s', className);
        const obj = this._internal.createObj(className);
        if (obj === null) {
            log.error('Worker> createObj failed for class: %s', className);
            return null;
        }
        log.info('Worker> createObj result: %s', obj.toString());
        return this.getWrapped(obj, className);
    }

    getService(className: string): ObjTuple | null {
        log.info('Worker> getService called: %s', className);
        const obj = this._internal.getService(className);
        if (obj === null) {
            log.error('Worker> getService failed for class: %s', className);
            return null;
        }
        log.info('Worker> getService result: %s', obj.toString());
        return this.getWrapped(obj, className);
    }

    hasClass(className: string): boolean {
        return this._internal.hasClass(className);
    }

    getAllClassNamesJSON(): string {
        return this._internal.getAllClassNamesJSON();
    }

    getProp(thisobj: ObjTuple, propName: string): any {
        log.info('Worker> getProp called: thisobj=%s, propName=%s', thisobj, propName);
        const obj = this.resolveWrapped(thisobj);
        log.info('Worker> resolved thisobj to: %s', obj);
        if (obj === null) {
            log.error('Worker> getProp failed: could not resolve thisobj=%s, propName=%s', thisobj, propName);
            return null;
        }
        const rval = obj.getProp(propName);
        log.info('Worker> getProp OK, result: %s', rval);
        return this.getWrapped(rval);
    }

    setProp(thisobj: ObjTuple, propName: string, value: any): boolean {
        log.info('Worker> setProp called: thisobj=%s, propName=%s, value=%s', thisobj, propName, value);
        const obj = this.resolveWrapped(thisobj);
        log.info('Worker> resolved thisobj to: %s', obj);
        if (obj === null) {
            log.error('Worker> setProp failed: could not resolve thisobj=%s, propName=%s, value=%s', thisobj, propName, value);
            return false;
        }
        // convert value using resolveWrapped
        const resolvedValue = this.resolveWrapped(value);
        log.info('Worker> setProp obj=%s propName=%s resolved value=%s', obj, propName, resolvedValue);
        const rval = obj.setProp(propName, resolvedValue);
        log.info('Worker> setProp OK, result: %s', rval);
        return rval;
    }

    invokeMethod(methodName: string, thisobj: ObjTuple, args: any[]): any {
        log.info('Worker> invokeMethod called: %s thisobj=%s args=%s', methodName, thisobj, args);
        log.info('Worker> thisobj._obj_id=%s', thisobj._obj_id);
        const obj = this.resolveWrapped(thisobj);
        log.info('Worker> resolved thisobj to: %s', obj);
        if (obj === null) {
            log.error('Worker> invokeMethod failed: could not resolve thisobj');
            return null;
        }

        // convert args using resolveWrapped
        const resolvedArgs = args.map(arg => this.resolveWrapped(arg));

        log.info('Worker> mth=%s thisobj=%s args=%s', methodName, thisobj, args);
        const rval = obj.invokeMethod(methodName, ...resolvedArgs);
        log.info('Worker> invokeMethod OK, result: %s', rval);

        return this.getWrapped(rval);
    }
}

const svc = new WorkerService();

parentPort?.on('message', (data: any) => {
    log.info('Worker> Received: <%s>', data);

    const method: string = data[0];
    const seqno: number = data[1];
    const args: any[] = data.slice(2);
    svc.invoke(method, seqno, args);
});
