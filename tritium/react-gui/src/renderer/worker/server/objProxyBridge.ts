import { ObjTuple, isObjTuple } from '../shared/ObjTuple';
import type { CueMol } from '@cuemol/core/src/cuemol';
import type { CueMolInternal } from '@cuemol/core/src/interfaces';

const log = console;

/**
 * Bridges the renderer-side `ObjProxy` to native C++ objects.
 *
 * The renderer never holds a native object directly -- it holds an
 * `ObjTuple` (slot id + class name). This class owns the slot table and
 * translates `ObjTuple` <-> native object for every proxied create / get /
 * set / invoke. Extracted from `WorkerService` so the transport-bridge
 * concern is isolated from the RPC dispatch table; `WorkerService` keeps
 * thin `_rpc*` forwarders that delegate here.
 */
export class ObjProxyBridge {
    private _objSlot: { [key: string]: any } = {};

    constructor(
        private _internal: CueMolInternal,
        private _cm: CueMol,
    ) {}

    /** Create a new native object of `className` and return it as an `ObjTuple`. */
    createObj(className: string): ObjTuple | null {
        const obj = this._internal.createObj(className);
        if (obj === null) {
            log.error(`Worker> ObjProxyBridge.createObj failed for class: ${className}`);
            return null;
        }
        return this.toObjTuple(obj, className);
    }

    /** Resolve a native singleton service by class name as an `ObjTuple`. */
    getService(className: string): ObjTuple | null {
        const obj = this._internal.getService(className);
        if (obj === null) {
            log.error(`Worker> ObjProxyBridge.getService failed for class: ${className}`);
            return null;
        }
        return this.toObjTuple(obj, className);
    }

    /** Whether the C++ layer registers a class with the given name. */
    hasClass(className: string): boolean {
        return this._cm.hasClass(className);
    }

    /** JSON array of every registered C++ class name. */
    getAllClassNamesJSON(): string {
        return this._cm.getAllClassNamesJSON();
    }

    /** Read property `propName` on the object behind `thisobj`. */
    getProp(thisobj: ObjTuple, propName: string): any {
        const native = this.lookupNativeByObjTuple(thisobj);
        if (native === null) {
            log.error(`Worker> ObjProxyBridge.getProp failed: could not resolve thisobj=${thisobj}, propName=${propName}`);
            return null;
        }
        const wrapper = this._cm.createWrapper(native)!;
        const rval = wrapper.getProp(propName);
        return this.toObjTuple(rval);
    }

    /**
     * Write `value` to property `propName` on the object behind `thisobj`.
     * An `ObjTuple` value is resolved back to its native object first.
     */
    setProp(thisobj: ObjTuple, propName: string, value: any): boolean {
        const native = this.lookupNativeByObjTuple(thisobj);
        if (native === null) {
            log.error(`Worker> ObjProxyBridge.setProp failed: could not resolve thisobj=${thisobj}, propName=${propName}, value=${value}`);
            return false;
        }
        const resolvedValue = this.lookupNativeByObjTuple(value);
        const wrapper = this._cm.createWrapper(native)!;
        wrapper.setProp(propName, resolvedValue);
        return true;
    }

    /**
     * Invoke `methodName` on the object behind `thisobj`. Each `ObjTuple`
     * argument is resolved to its native object before the call.
     */
    invokeMethod(methodName: string, thisobj: ObjTuple, args: any[]): any {
        const native = this.lookupNativeByObjTuple(thisobj);
        if (native === null) {
            log.error('Worker> ObjProxyBridge.invokeMethod failed: could not resolve thisobj');
            return null;
        }
        const resolvedArgs = args.map((arg) => this.lookupNativeByObjTuple(arg));
        const wrapper = this._cm.createWrapper(native)!;
        const rval = wrapper.invokeMethod(methodName, ...resolvedArgs);
        return this.toObjTuple(rval);
    }

    /**
     * Wrap a native object into an `ObjTuple` (slot id + class name),
     * registering it in the slot table. Primitive values pass through
     * unchanged.
     */
    private toObjTuple(obj: any, clsName?: string): ObjTuple | any {
        if (!(obj && typeof obj === 'object' && 'toObjID' in obj)) {
            // primitive value -- return directly
            return obj;
        }

        const slot_id = obj.toObjID();
        if (!(slot_id in this._objSlot)) {
            this._objSlot[slot_id.toString()] = obj;
        }

        if (clsName) {
            return new ObjTuple(slot_id, clsName);
        } else {
            return new ObjTuple(slot_id, obj.getClassName());
        }
    }

    /** Resolve an `ObjTuple` back to its native object via the slot table. */
    private lookupNativeByObjTuple(obj: any): any {
        if (!isObjTuple(obj)) {
            return obj;
        }
        const objTuple = obj as ObjTuple;
        const slot_id = objTuple._obj_id;
        if (!(slot_id in this._objSlot)) {
            log.error(`Worker> ObjProxyBridge.lookupNativeByObjTuple failed: invalid slot_id: ${slot_id}`);
            return null;
        }
        return this._objSlot[slot_id];
    }
}
