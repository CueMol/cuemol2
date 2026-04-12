import { ObjTuple, isObjTuple } from './ObjTuple';
import type { AsyncCueMol } from './AsyncCueMol';
import { createLogger } from "../logger";

const log = createLogger(import.meta.url);

export class ObjProxy {
    private _obj: ObjTuple;
    private _acm: AsyncCueMol;

    constructor(objId: string, className: string, worker: AsyncCueMol) {
        this._obj = new ObjTuple(objId, className);
        this._acm = worker;
    }

    getClassName(): string {
        return this._obj.className;
    }

    getObjTuple(): ObjTuple {
        return this._obj;
    }

    async getProp(propName: string): Promise<any> {
        try {
            const result = await this._acm.invokeWorker(
                "getProp",
                this._obj,
                propName,
            );
            log.info('NativeObj.getProp OK, result: %s', result);
            if (isObjTuple(result[0])) {
                const objTup = result[0] as ObjTuple;
                return new ObjProxy(objTup._obj_id, objTup._class_name,
                    this._acm);
            } else {
                return result[0];
            }
        } catch (e) {
            log.error('getProp failed: %s, %s', propName, e);
            throw e;
        }
    }

    async setProp(propName: string, value: any): Promise<void> {
        try {
            await this._acm.invokeWorker(
                "setProp",
                this._obj,
                propName,
                value,
            );
            log.info('NativeObj.setProp OK');
        } catch (e) {
            log.error('setProp failed: %s, %s', propName, e);
            throw e;
        }
    }

    async invokeMethod(method: string, ...args: any[]): Promise<any> {
        try {
            const result = await this._acm.invokeWorker("invokeMethod",
                method, this._obj, args);
            log.info('NativeObj.invokeMethod OK, result: %s', result);
            if (isObjTuple(result[0])) {
                const objTup = result[0] as ObjTuple;
                return new ObjProxy(objTup._obj_id, objTup._class_name,
                    this._acm);
            } else {
                return result[0];
            }
        } catch (e) {
            log.error('invokeMethod failed: %s, %s', method, e);
            throw e;
        }

    }
}
