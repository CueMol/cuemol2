/**
 * @file renderer/worker/client/ObjProxy.ts
 * @description IPC proxy for a single C++ wrapper object living in the
 * Web Worker. `BaseWrapper` (in renderer mode) holds an `ObjProxy` instead
 * of the native object, and routes every property access / method call
 * through `getProp` / `setProp` / `invokeMethod`. The worker side dispatches
 * each call via the `RpcMap` table.
 */
import { ObjTuple, isObjTuple } from '../shared/ObjTuple';
import type { AsyncCueMol } from './AsyncCueMol';

// Renderer-thread logger. This module deliberately uses `console` rather
// than the pino-based `createLogger` helper, matching the sibling
// `WorkerService.ts` (where createLogger is intentionally kept commented
// out): pino + pino-pretty are not wired into the renderer/worker bundle,
// and these calls sit on the hot per-property RPC path.
const log = console;

/**
 * Renderer-side handle for a C++ wrapper object owned by the worker.
 *
 * @remarks Identity is captured by an `ObjTuple` (`{_obj_id, _class_name}`)
 *   so that every IPC round-trip can address the same native object. When
 *   a property read or method call returns another wrapper object, the
 *   reply carries an `ObjTuple` which is auto-wrapped into a new
 *   `ObjProxy` so the caller can chain further calls.
 */
export class ObjProxy {
    private _obj: ObjTuple;
    private _acm: AsyncCueMol;

    /**
     * @param objId - Worker-side object id (opaque string).
     * @param className - C++ class name (used by `ObjectFactory` to choose
     *   the wrapper class).
     * @param worker - The `AsyncCueMol` used to send `invokeRpc` calls.
     */
    constructor(objId: string, className: string, worker: AsyncCueMol) {
        this._obj = new ObjTuple(objId, className);
        this._acm = worker;
    }

    /** Return the C++ class name captured at construction. */
    getClassName(): string {
        return this._obj.className;
    }

    /** Return the underlying `ObjTuple` (used by `ObjectFactory.getWrapped`). */
    getObjTuple(): ObjTuple {
        return this._obj;
    }

    /**
     * Read a property on the worker-side wrapper.
     *
     * @param propName - Property name on the C++ class.
     * @returns The property value. If the reply is an `ObjTuple`, it is
     *   auto-wrapped into a new `ObjProxy`.
     */
    async getProp(propName: string): Promise<unknown> {
        try {
            const result = await this._acm.invokeRpc('getProp', this._obj, propName);
            log.info({ propName, result }, 'NativeObj.getProp OK');
            if (isObjTuple(result)) {
                const objTup = result as ObjTuple;
                return new ObjProxy(objTup._obj_id, objTup._class_name, this._acm);
            }
            return result;
        } catch (e) {
            log.error({ propName, err: e }, 'NativeObj.getProp failed');
            throw e;
        }
    }

    /**
     * Write a property on the worker-side wrapper.
     *
     * @param propName - Property name on the C++ class.
     * @param value - New value. May be an `ObjProxy` / `ObjTuple` for
     *   wrapper-typed properties (the worker side unwraps it).
     */
    async setProp(propName: string, value: unknown): Promise<void> {
        try {
            await this._acm.invokeRpc('setProp', this._obj, propName, value);
            log.info({ propName }, 'NativeObj.setProp OK');
        } catch (e) {
            log.error({ propName, err: e }, 'NativeObj.setProp failed');
            throw e;
        }
    }

    /**
     * Invoke a method on the worker-side wrapper.
     *
     * @param method - Method name on the C++ class.
     * @param args - Arguments passed through to the worker.
     * @returns The method return value. If the reply is an `ObjTuple`, it
     *   is auto-wrapped into a new `ObjProxy`.
     */
    async invokeMethod(method: string, ...args: unknown[]): Promise<unknown> {
        try {
            const result = await this._acm.invokeRpc('invokeMethod', method, this._obj, args);
            log.info({ method, result }, 'NativeObj.invokeMethod OK');
            if (isObjTuple(result)) {
                const objTup = result as ObjTuple;
                return new ObjProxy(objTup._obj_id, objTup._class_name, this._acm);
            }
            return result;
        } catch (e) {
            log.error({ method, err: e }, 'NativeObj.invokeMethod failed');
            throw e;
        }
    }
}
