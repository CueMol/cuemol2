import path from 'path';
import { Worker } from 'worker_threads';
import { BaseWrapper } from '../BaseWrapper';
import { wrapper_map } from '../wrappers/wrapper-loader';
import { ObjTuple } from './ObjTuple';
import { ObjProxy } from './ObjProxy';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createLogger } from "@/logger";

const log = createLogger(import.meta.url);

function makeMethodSeq(method: string, seqno: number): string {
    return method + '.' + seqno.toString();
}

export class AsyncCueMol {
    private _ready: boolean = false;
    private _seqno: number = 0;
    private _worker: Worker;
    private _worker_onmessage_dict: { [key: string]: any } = {};
    // private _slot: { [key: string]: any } = {};

    constructor() {
        // this._seqno = 0;
        log.debug('launch worker...');

        // this._worker = new Worker(path.join(import.meta.dirname, 'worker.ts'));
        const cwd = dirname(fileURLToPath(import.meta.url));
        log.debug('current working directory: %s', cwd);
        this._worker = new Worker(path.join(cwd, 'worker.ts'));
        log.info('launch worker OK');

        this._worker.on('message', (event: any) => {
            log.info('worker message received: %s', event);
            // if (event.data[0] === 'event-notify') {
            //     // const [, ...evtargs] = event.data;
            //     const evtargs = event.data.slice(1) as [number, string, number, number, number, string];
            //     try {
            //         this.eventNotify(...evtargs);
            //     } catch (e) {
            //         log.info('event manager notify failed:', e);
            //     }
            //     return;
            // }
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
        if (xfer === null)
            this._worker.postMessage([method, seq, ...args]);
        else
            this._worker.postMessage([method, seq, ...args], [xfer]);
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
                    // log.info('invokeWorker OK:', method, 'msgargs:', msgargs);
                    resolve(msgargs);
                } else {
                    // log.info('invokeWorker error:', method, 'error:', msgargs[0]);
                    reject(msgargs[0]);
                }
            });
        });
        // send invokeWorker message to worker thread
        this.postMessage(method, cur_seq, args);
        return promise;
    }

    // async invokeWorkerWithTransfer

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
            this._worker.terminate();
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
            // log.info('createObj OK, result=', result);
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
            // log.info('createObj OK, result=', result);
            const obj_id = result[0]._obj_id;
            const natObj = new ObjProxy(obj_id, className, this);
            return this.createWrapperImpl(natObj);
        } catch (e) {
            log.error('getService failed: %s', e);
        }
        return null;

        // const obj = this.internal.getService(className);
        // return this.createWrapper(obj as NativeObject);
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
