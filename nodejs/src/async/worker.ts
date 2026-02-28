import { parentPort } from 'worker_threads';
import bindings from 'bindings';
import type { CueMolInternal } from '../interfaces';
import { ObjTuple, isObjTuple } from './ObjTuple.ts';

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
        console.log("Worker>>>>> _internal: ", this._internal);

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
        console.log('Worker> invoke called:', method, 'seqno:', seqno, 'args:', args);
        if (!(method in this._methods)) {
            console.log('Worker> unknown method:', method);
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
            console.log('Worker> call method failed:', method, e);
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
            console.log('Worker> getWrapped result is a native object, create wrapper');
        }
        else {
            console.log('Worker> getWrapped result is a primitive value, return directly:', obj);
            return obj;
        }

        // check if obj already has slot
        const slot_id = obj.toObjID();
        if (!(slot_id in this._objSlot)) {
            this._objSlot[slot_id.toString()] = obj;
        } else {
            console.log('Worker> getWrapped: obj already has slot, slot_id=', slot_id);
        }

        console.log('Worker> getWrapped OK, slot_id=', slot_id, 'obj=', obj);
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
            console.log('Worker> resolveWrapped failed: invalid slot_id:', slot_id);
            return null;
        }
        return this._objSlot[slot_id];
    }

    //////////

    initCueMol(loadPath?: string): boolean {
        console.log('Worker> initCueMol called:', loadPath);
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
        console.log('Worker> terminateWorker called');
        parentPort?.close();
    }

    createObj(className: string): ObjTuple | null {
        console.log('Worker> createObj called:', className);
        const obj = this._internal.createObj(className);
        if (obj === null) {
            console.log('Worker> createObj failed for class:', className);
            return null;
        }
        console.log('Worker> createObj result:', obj.toString());
        return this.getWrapped(obj, className);
    }

    getService(className: string): ObjTuple | null {
        console.log('Worker> getService called:', className);
        const obj = this._internal.getService(className);
        if (obj === null) {
            console.log('Worker> getService failed for class:', className);
            return null;
        }
        console.log('Worker> getService result:', obj.toString());
        return this.getWrapped(obj, className);
    }

    hasClass(className: string): boolean {
        return this._internal.hasClass(className);
    }

    getAllClassNamesJSON(): string {
        return this._internal.getAllClassNamesJSON();
    }

    getProp(thisobj: ObjTuple, propName: string): any {
        console.log('Worker> getProp called:', 'thisobj:', thisobj, 'propName:', propName);
        const obj = this.resolveWrapped(thisobj);
        console.log('Worker> resolved thisobj to:', obj);
        if (obj === null) {
            console.log('Worker> getProp failed: could not resolve thisobj:',
                thisobj, 'propName:', propName);
            return null;
        }
        const rval = obj.getProp(propName);
        console.log('Worker> getProp OK, result:', rval);
        return this.getWrapped(rval);
    }

    setProp(thisobj: ObjTuple, propName: string, value: any): boolean {
        console.log('Worker> setProp called:', 'thisobj:', thisobj, 'propName:', propName, 'value:', value);
        const obj = this.resolveWrapped(thisobj);
        console.log('Worker> resolved thisobj to:', obj);
        if (obj === null) {
            console.log('Worker> setProp failed: could not resolve thisobj:',
                thisobj, 'propName:', propName, 'value:', value);
            return false;
        }
        // convert value using resolveWrapped
        const resolvedValue = this.resolveWrapped(value);
        console.log('Worker> setProp obj:', obj, 'propName:', propName, 'resolved value:', resolvedValue);
        const rval = obj.setProp(propName, resolvedValue);
        console.log('Worker> setProp OK, result:', rval);
        return rval;
    }

    invokeMethod(methodName: string, thisobj: ObjTuple, args: any[]): any {
        console.log('Worker> invokeMethod called:', methodName, 'thisobj:', thisobj, 'args:', args);
        console.log('Worker> thisobj._obj_id:', thisobj._obj_id);
        const obj = this.resolveWrapped(thisobj);
        console.log('Worker> resolved thisobj to:', obj);
        if (obj === null) {
            console.log('Worker> invokeMethod failed: could not resolve thisobj:',
                thisobj, 'methodName:', methodName, 'args:', args);
            return null;
        }

        // convert args using resolveWrapped
        const resolvedArgs = args.map(arg => this.resolveWrapped(arg));

        console.log('Worker> obj:', obj, 'methodName:', methodName, 'args:', resolvedArgs);
        const rval = obj.invokeMethod(methodName, ...resolvedArgs);
        console.log('Worker> invokeMethod OK, result:', rval);

        return this.getWrapped(rval);
    }
}

const svc = new WorkerService();

parentPort?.on('message', (data: any) => {
    console.log('Worker> Received:', data);

    const method: string = data[0];
    const seqno: number = data[1];
    const args: any[] = data.slice(2);
    svc.invoke(method, seqno, args);
});
