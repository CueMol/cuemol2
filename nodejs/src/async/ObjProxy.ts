import { ObjTuple, isObjTuple } from './ObjTuple';
import type { AsyncCueMol } from './AsyncCueMol';

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
            console.log('NativeObj.getProp OK, result:', result);
            if (isObjTuple(result[0])) {
                const objTup = result[0] as ObjTuple;
                return new ObjProxy(objTup._obj_id, objTup._class_name,
                    this._acm);
            } else {
                return result[0];
            }
        } catch (e) {
            console.log('getProp failed:', propName, e);
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
            console.log('NativeObj.setProp OK');
        } catch (e) {
            console.log('setProp failed:', propName, e);
            throw e;
        }
    }

    async invokeMethod(method: string, ...args: any[]): Promise<any> {
        try {
            const result = await this._acm.invokeWorker("invokeMethod",
                method, this._obj, args);
            console.log('NativeObj.invokeMethod OK, result:', result);
            if (isObjTuple(result[0])) {
                const objTup = result[0] as ObjTuple;
                return new ObjProxy(objTup._obj_id, objTup._class_name,
                    this._acm);
            } else {
                return result[0];
            }
        } catch (e) {
            console.log('invokeMethod failed:', method, e);
            throw e;
        }

    }
}
