import { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import { wrapper_map } from '@cuemol/core/src/wrappers/wrapper-loader';
import type { AsyncCueMol } from './AsyncCueMol';
import { ObjTuple } from '../shared/ObjTuple';
import { ObjProxy } from './ObjProxy';
import { WorkerTransport } from './WorkerTransport';

const log = console;

export class ObjectFactory {
    private _transport: WorkerTransport;
    private _asyncCueMol: AsyncCueMol;

    constructor(transport: WorkerTransport, asyncCueMol: AsyncCueMol) {
        this._transport = transport;
        this._asyncCueMol = asyncCueMol;
    }

    createWrapperImpl(obj: ObjProxy): BaseWrapper {
        const className = obj.getClassName();
        const Klass = wrapper_map[className];
        const wrapper = new Klass(obj, this._asyncCueMol);
        return wrapper;
    }

    async createWrapper(prom: Promise<ObjProxy>): Promise<BaseWrapper | null> {
        return prom.then((resolvedObj: any) => {
            if (resolvedObj === null || resolvedObj === undefined) return null;
            return this.createWrapperImpl(resolvedObj);
        }).catch((e: any) => {
            log.warn('Error resolving Promise for obj:', e);
            return null;
        });
    }

    getWrapped(obj: ObjProxy): ObjTuple {
        return obj.getObjTuple();
    }

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
