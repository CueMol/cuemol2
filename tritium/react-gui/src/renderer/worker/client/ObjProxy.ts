import { ObjTuple, isObjTuple } from '../shared/ObjTuple';
import type { AsyncCueMol } from './AsyncCueMol';
// import { createLogger } from "../logger";

// const log = createLogger(import.meta.url);
const log = console;

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

    async getProp(propName: string): Promise<unknown> {
        try {
            const result = await this._acm.invokeRpc('getProp', this._obj, propName);
            log.info('NativeObj.getProp(', propName, ') OK, result:', result);
            if (isObjTuple(result)) {
                const objTup = result as ObjTuple;
                return new ObjProxy(objTup._obj_id, objTup._class_name, this._acm);
            }
            return result;
        } catch (e) {
            log.error(`getProp failed: ${propName},`, e);
            throw e;
        }
    }

    async setProp(propName: string, value: unknown): Promise<void> {
        try {
            await this._acm.invokeRpc('setProp', this._obj, propName, value);
            log.info('NativeObj.setProp(', propName, ') OK');
        } catch (e) {
            log.error(`setProp failed: ${propName},`, e);
            throw e;
        }
    }

    async invokeMethod(method: string, ...args: unknown[]): Promise<unknown> {
        try {
            const result = await this._acm.invokeRpc('invokeMethod', method, this._obj, args);
            log.info('NativeObj.invokeMethod(', method, ') OK, result:', result);
            if (isObjTuple(result)) {
                const objTup = result as ObjTuple;
                return new ObjProxy(objTup._obj_id, objTup._class_name, this._acm);
            }
            return result;
        } catch (e) {
            log.error(`invokeMethod failed: ${method},`, e);
            throw e;
        }
    }
}
