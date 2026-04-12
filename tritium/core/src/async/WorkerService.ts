// NOTE: @cuemol/core is externalized in the Vite worker build (see
// react-gui/electron.vite.config.ts) so that the native addon is loaded
// via require() at runtime rather than bundled by Vite.
import { getModule } from '@cuemol/core';
import type { CueMolInternal } from '../interfaces';
import { ObjTuple, isObjTuple } from './ObjTuple';
import { createLogger } from '../logger';

const log = createLogger(import.meta.url);

type ServiceMethod = (...args: any[]) => any;

export class WorkerService {

    private _methods: { [key: string]: ServiceMethod };
    private _internal: CueMolInternal;
    private _objSlot: { [key: string]: any } = {};
    private _postMessage: (data: any[]) => void;
    private _close: () => void;

    constructor(
        postMessage: (data: any[]) => void,
        close: () => void = () => {}
    ) {
        this._internal = getModule();
        this._postMessage = postMessage;
        this._close = close;
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
            this._postMessage([method, seqno, false]);
            return;
        }

        try {
            const result = this._methods[method].apply(this, args);
            if (Array.isArray(result)) {
                this._postMessage([method, seqno, true, ...result]);
            } else {
                this._postMessage([method, seqno, true, result]);
            }
        } catch (e) {
            log.error('Worker> call method failed: %s, %s', method, e);
            this._postMessage([method, seqno, false, e]);
        }
    }

    getWrapped(obj: any, clsName?: string): ObjTuple | any {
        if (obj && typeof obj === 'object' && 'toObjID' in obj) {
            log.info('Worker> getWrapped result is a native object, create wrapper');
        } else {
            log.info('Worker> getWrapped result is a primitive value, return directly: %s', obj);
            return obj;
        }

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
        return true;
    }

    terminateWorker(): void {
        log.info('Worker> terminateWorker called');
        this._close();
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
        if (obj === null) {
            log.error('Worker> setProp failed: could not resolve thisobj=%s, propName=%s, value=%s', thisobj, propName, value);
            return false;
        }
        const resolvedValue = this.resolveWrapped(value);
        log.info('Worker> setProp obj=%s propName=%s resolved value=%s', obj, propName, resolvedValue);
        const rval = obj.setProp(propName, resolvedValue);
        log.info('Worker> setProp OK, result: %s', rval);
        return rval;
    }

    invokeMethod(methodName: string, thisobj: ObjTuple, args: any[]): any {
        log.info('Worker> invokeMethod called: %s thisobj=%s args=%s', methodName, thisobj, args);
        const obj = this.resolveWrapped(thisobj);
        if (obj === null) {
            log.error('Worker> invokeMethod failed: could not resolve thisobj');
            return null;
        }
        const resolvedArgs = args.map(arg => this.resolveWrapped(arg));
        log.info('Worker> mth=%s thisobj=%s args=%s', methodName, thisobj, args);
        const rval = obj.invokeMethod(methodName, ...resolvedArgs);
        log.info('Worker> invokeMethod OK, result: %s', rval);
        return this.getWrapped(rval);
    }
}
