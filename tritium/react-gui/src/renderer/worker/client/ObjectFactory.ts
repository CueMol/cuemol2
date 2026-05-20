/**
 * @file renderer/worker/client/ObjectFactory.ts
 * @description Constructs `BaseWrapper` instances from `ObjProxy` handles.
 *
 * Used by `AsyncCueMol` as a facade. Direct callers go through
 * `createObj` / `getService`, which round-trip to the worker and wrap the
 * returned id; `createWrapperImpl` is also called from `ObjProxy.getProp`
 * / `invokeMethod` when a reply carries an `ObjTuple`.
 */
import { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import { wrapper_map } from '@cuemol/core/src/wrappers/wrapper-loader';
import type { AsyncCueMol } from './AsyncCueMol';
import { ObjTuple } from '../shared/ObjTuple';
import { ObjProxy } from './ObjProxy';
import { WorkerTransport } from './WorkerTransport';

const log = console;

/**
 * Factory for renderer-side `BaseWrapper` instances backed by `ObjProxy`.
 */
export class ObjectFactory {
    private _transport: WorkerTransport;
    private _asyncCueMol: AsyncCueMol;

    /**
     * @param transport - Worker transport used for `createObj` /
     *   `getService` / `hasClass` IPC calls.
     * @param asyncCueMol - Parent facade, passed to each `ObjProxy` so it
     *   can dispatch RPC calls.
     */
    constructor(transport: WorkerTransport, asyncCueMol: AsyncCueMol) {
        this._transport = transport;
        this._asyncCueMol = asyncCueMol;
    }

    /**
     * Construct a `BaseWrapper` for an already-resolved `ObjProxy`.
     *
     * @param obj - The proxy whose class name selects the wrapper class.
     * @returns A new wrapper instance.
     * @remarks Synchronous variant -- use when you already hold the proxy.
     *   For Promise inputs use {@link createWrapper}.
     */
    createWrapperImpl(obj: ObjProxy): BaseWrapper {
        const className = obj.getClassName();
        const Klass = wrapper_map[className];
        const wrapper = new Klass(obj, this._asyncCueMol);
        return wrapper;
    }

    /**
     * Resolve a Promise of `ObjProxy` and wrap the result.
     *
     * @param prom - Promise that resolves with a proxy or null/undefined.
     * @returns The wrapper, or `null` when the proxy is missing or the
     *   Promise rejects (errors are logged).
     */
    async createWrapper(prom: Promise<ObjProxy>): Promise<BaseWrapper | null> {
        return prom.then((resolvedObj: any) => {
            if (resolvedObj === null || resolvedObj === undefined) return null;
            return this.createWrapperImpl(resolvedObj);
        }).catch((e: any) => {
            log.warn('Error resolving Promise for obj:', e);
            return null;
        });
    }

    /** Return the `ObjTuple` underlying a proxy. */
    getWrapped(obj: ObjProxy): ObjTuple {
        return obj.getObjTuple();
    }

    /**
     * Create a new C++ object of `className` on the worker side and return
     * a wrapper for it.
     *
     * @param className - Registered C++ class name.
     * @returns The new wrapper, or `null` if creation fails.
     */
    async createObj(className: string): Promise<BaseWrapper | null> {
        try {
            const result = await this._transport.invokeWorker('createObj', className);
            if (result === null) {
                log.warn(`createObj failed for class: ${className}`);
                return null;
            }
            const obj_id = result[0]._obj_id;
            const natObj = new ObjProxy(obj_id, className, this._asyncCueMol);
            return this.createWrapperImpl(natObj);
        } catch (e) {
            log.error('createObj failed:', e);
        }
        return null;
    }

    /**
     * Look up a registered singleton service (e.g. `'StyleManager'`,
     * `'StreamManager'`) and return a wrapper.
     *
     * @param className - Registered service class name.
     * @returns The wrapper, or `null` if the service is unknown.
     */
    async getService(className: string): Promise<BaseWrapper | null> {
        try {
            const result = await this._transport.invokeWorker('getService', className);
            if (result === null) {
                log.warn(`getService failed for class: ${className}`);
                return null;
            }
            const obj_id = result[0]._obj_id;
            const natObj = new ObjProxy(obj_id, className, this._asyncCueMol);
            return this.createWrapperImpl(natObj);
        } catch (e) {
            log.error('getService failed:', e);
        }
        return null;
    }

    /**
     * Check whether a class name is registered with the C++ class
     * registry.
     *
     * @param className - Class name to probe.
     * @returns `true`/`false`, or `null` on transport failure.
     */
    async hasClass(className: string): Promise<boolean | null> {
        try {
            const result = await this._transport.invokeWorker('hasClass', className);
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

    /**
     * Return a JSON document listing every class known to the C++ class
     * registry. Used to populate dev / introspection tools.
     *
     * @returns JSON string, or `null` on failure.
     */
    async getAllClassNamesJSON(): Promise<string | null> {
        try {
            const result = await this._transport.invokeWorker('getAllClassNamesJSON');
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
}
