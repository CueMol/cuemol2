import { ObjTuple, ObjId, isObjTuple } from './ObjTuple';
import type { AsyncCueMol } from './AsyncCueMol';

const log = console;

export class ObjProxy {
    private _obj: ObjTuple;
    private _acm: AsyncCueMol;

    constructor(objId: ObjId, className: string, worker: AsyncCueMol) {
        this._obj = new ObjTuple(objId, className);
        this._acm = worker;
    }

    getClassName(): string {
        return this._obj.className;
    }

    getObjTuple(): ObjTuple {
        return this._obj;
    }

    // Return type is object: fire postMessage immediately, return future ObjProxy
    invokeMethodObj(method: string, className: string, ...args: any[]): ObjProxy {
        const seq = this._acm.getSeqNo();
        this._acm.postPipelined('invokeMethod', seq, [method, this._obj, args]);
        return new ObjProxy({ future: seq }, className, this._acm);
    }

    // Return type is void: fire-and-forget
    invokeMethodVoid(method: string, ...args: any[]): Promise<void> {
        const seq = this._acm.getSeqNo();
        this._acm.postPipelined('invokeMethod', seq, [method, this._obj, args]);
        return Promise.resolve();
    }

    // Return type is primitive: full round trip
    async invokeMethod(method: string, ...args: any[]): Promise<any> {
        try {
            const result = await this._acm.invokeWorker('invokeMethod',
                method, this._obj, args);
            if (isObjTuple(result[0])) {
                const objTup = result[0] as ObjTuple;
                return new ObjProxy(objTup._obj_id, objTup._class_name, this._acm);
            }
            return result[0];
        } catch (e) {
            log.error(`invokeMethod failed: ${method},`, e);
            throw e;
        }
    }

    // Getter returns object: fire postMessage immediately, return future ObjProxy
    getPropObj(propName: string, className: string): ObjProxy {
        const seq = this._acm.getSeqNo();
        this._acm.postPipelined('getProp', seq, [this._obj, propName]);
        return new ObjProxy({ future: seq }, className, this._acm);
    }

    // Getter returns primitive: full round trip
    async getProp(propName: string): Promise<any> {
        try {
            const result = await this._acm.invokeWorker(
                'getProp',
                this._obj,
                propName,
            );
            if (isObjTuple(result[0])) {
                const objTup = result[0] as ObjTuple;
                return new ObjProxy(objTup._obj_id, objTup._class_name, this._acm);
            }
            return result[0];
        } catch (e) {
            log.error(`getProp failed: ${propName},`, e);
            throw e;
        }
    }

    // Always fire-and-forget
    setProp(propName: string, value: any): Promise<void> {
        const seq = this._acm.getSeqNo();
        this._acm.postPipelined('setProp', seq, [this._obj, propName, value]);
        return Promise.resolve();
    }
}
