import { BaseWrapper } from '../BaseWrapper';
import { wrapper_map } from '../wrappers/wrapper-loader';
import { ObjTuple } from './ObjTuple';
import { ObjProxy } from './ObjProxy';
import { createLogger } from '@/logger';
import type { WorkerAdapter } from './WorkerAdapter';

const log = createLogger(import.meta.url);

function makeMethodSeq(method: string, seqno: number): string {
    return method + '.' + seqno.toString();
}

export class AsyncCueMol {
    private _ready: boolean = false;
    private _seqno: number = 0;
    private _adapter: WorkerAdapter;
    private _worker_onmessage_dict: { [key: string]: any } = {};

    constructor(adapter: WorkerAdapter) {
        this._adapter = adapter;

        this._adapter.onMessage((event: any) => {
            log.info('worker message received: %s', event);
            const [method, seqno, ...args] = event;
            const method_seq = makeMethodSeq(method, seqno);

            if (method_seq in this._worker_onmessage_dict) {
                this._worker_onmessage_dict[method_seq].apply(this, args);
                delete this._worker_onmessage_dict[method_seq];
            }
        });

        this._ready = true;
    }

    isReady(): boolean {
        return this._ready;
    }

    postMessage(method: string, seq: number, args: any[], xfer: any = null) {
        log.debug('postMessage called: %s %s %s, xfer: %s', method, seq, args, xfer);
        this._adapter.postMessage([method, seq, ...args], xfer);
    }

    getSeqNo(): number {
        this._seqno++;
        return this._seqno;
    }

    addListener(method: string, seqno: number, handler: any): void {
        const method_seq = makeMethodSeq(method, seqno);
        this._worker_onmessage_dict[method_seq] = handler;
    }

    async invokeWorker(method: string, ...args: any[]): Promise<any[]> {
        const cur_seq = this.getSeqNo();
        let promise = new Promise<any[]>((resolve, reject) => {
            this.addListener(method, cur_seq, (result: boolean, ...msgargs: any[]): void => {
                if (result) {
                    resolve(msgargs);
                } else {
                    reject(msgargs[0]);
                }
            });
        });
        this.postMessage(method, cur_seq, args);
        return promise;
    }

    //////////

    createWrapperImpl(obj: ObjProxy): BaseWrapper {
        log.info('createWrapper called for obj: %s', obj);
        const className = obj.getClassName();
        log.info('createWrapper called for class: %s', className);
        const Klass = wrapper_map[className];
        const wrapper = new Klass(obj, this);
        return wrapper;
    }

    async createWrapper(prom: Promise<ObjProxy>): Promise<BaseWrapper | null> {
        log.info('createWrapper called for Promise: %s', prom);
        return prom.then((resolvedObj: any) => {
            log.info('Promise resolved for obj: %s', resolvedObj);
            return this.createWrapperImpl(resolvedObj);
        }).catch((e: any) => {
            log.warn('Error resolving Promise for obj:', e);
            return null;
        });
    }

    getWrapped(obj: ObjProxy): ObjTuple {
        return obj.getObjTuple();
    }

    //////////

    async initCueMol(sysConfigPath?: string): Promise<void> {
        log.info('load_path: %s', sysConfigPath);

        try {
            await this.invokeWorker('initCueMol', sysConfigPath);
            log.info('initCueMol OK');
        } catch (e) {
            log.error('initCueMol failed: %s', e);
        }
    }

    async terminateWorker(): Promise<void> {
        try {
            await this.invokeWorker('terminateWorker');
            log.info('terminateWorker OK');
            this._adapter.terminate();
            this._ready = false;
        } catch (e) {
            log.error('terminateWorker failed: %s', e);
        }
    }

    async createObj(className: string): Promise<BaseWrapper | null> {
        try {
            const result = await this.invokeWorker('createObj', className);
            if (result === null) {
                log.warn('createObj failed for class: %s', className);
                return null;
            }
            const obj_id = result[0]._obj_id;
            const natObj = new ObjProxy(obj_id, className, this);
            return this.createWrapperImpl(natObj);
        } catch (e) {
            log.error('createObj failed: %s', e);
        }
        return null;
    }

    async getService(className: string): Promise<BaseWrapper | null> {
        try {
            const result = await this.invokeWorker('getService', className);
            if (result === null) {
                log.warn('getService failed for class: %s', className);
                return null;
            }
            const obj_id = result[0]._obj_id;
            const natObj = new ObjProxy(obj_id, className, this);
            return this.createWrapperImpl(natObj);
        } catch (e) {
            log.error('getService failed: %s', e);
        }
        return null;
    }

    async hasClass(className: string): Promise<boolean | null> {
        try {
            const result = await this.invokeWorker('hasClass', className);
            if (result === null) {
                log.warn('hasClass failed for class: %s', className);
                return null;
            }
            return result[0] as boolean;
        } catch (e) {
            log.error('hasClass failed: %s', e);
        }
        return null;
    }

    async getAllClassNamesJSON(): Promise<string | null> {
        try {
            const result = await this.invokeWorker('getAllClassNamesJSON');
            if (result === null) {
                log.warn('getAllClassNamesJSON failed');
                return null;
            }
            return result[0] as string;
        } catch (e) {
            log.error('getAllClassNamesJSON failed: %s', e);
        }
        return null;
    }
}
