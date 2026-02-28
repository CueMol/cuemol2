import path from 'path';
import { Worker } from 'worker_threads';
import { BaseWrapper } from '../BaseWrapper';
import { wrapper_map } from '../wrappers/wrapper-loader';
import { ObjTuple } from './ObjTuple';
import { ObjProxy } from './ObjProxy';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

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
        console.log('launch worker...');

        // this._worker = new Worker(path.join(import.meta.dirname, 'worker.ts'));
        const cwd = dirname(fileURLToPath(import.meta.url));
        console.log('current working directory:', cwd);
        this._worker = new Worker(path.join(cwd, 'worker.ts'));
        console.log('launch worker OK');

        this._worker.on('message', (event: any) => {
            console.log('worker message received:', event);
            // if (event.data[0] === 'event-notify') {
            //     // const [, ...evtargs] = event.data;
            //     const evtargs = event.data.slice(1) as [number, string, number, number, number, string];
            //     try {
            //         this.eventNotify(...evtargs);
            //     } catch (e) {
            //         console.log('event manager notify failed:', e);
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
        console.log('postMessage called:', method, seq, args, 'xfer:', xfer);
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
                    // console.log('invokeWorker OK:', method, 'msgargs:', msgargs);
                    resolve(msgargs);
                } else {
                    // console.log('invokeWorker error:', method, 'error:', msgargs[0]);
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

    createWrapper(nativeObj: any): BaseWrapper | null {
        if (typeof nativeObj === 'undefined') {
            return null;
        }

        if (nativeObj != null && typeof (nativeObj as any).then === 'function') {
            console.log('createWrapper called for Promise:', nativeObj);
            return nativeObj.then((resolvedObj: any) => {
                console.log('Promise resolved for nativeObj:', resolvedObj);
                return this.createWrapper(resolvedObj);
            }
            ).catch((e: any) => {
                console.log('Error resolving Promise for nativeObj:', e);
                return null;
            });
        }

        // const [_, className] = nativeObj as [number, string];
        console.log('createWrapper called for nativeObj:', nativeObj);
        const className = nativeObj.getClassName();
        console.log('createWrapper called for class:', className);
        const Klass = wrapper_map[className];
        const obj = new Klass(nativeObj, this);
        return obj;
    }

    getWrapped(nativeObj: ObjProxy): ObjTuple {
        return nativeObj.getObj();
    }

    //////////

    async initCueMol(sysConfigPath?: string): Promise<void> {
        console.log('load_path:', sysConfigPath);

        try {
            await this.invokeWorker('initCueMol', sysConfigPath);
            console.log('init cuemol OK');
        } catch (e) {
            console.log('init cuemol ERROR!!!', e);
        }
    }

    async terminateWorker(): Promise<void> {
        try {
            await this.invokeWorker('terminateWorker');
            console.log('terminateWorker OK');
            this._worker.terminate();
            this._ready = false;
        } catch (e) {
            console.log('terminateWorker ERROR: ', e);
        }
    }

    async createObj(className: string): Promise<BaseWrapper | null> {
        try {
            const result = await this.invokeWorker('createObj', className);
            if (result === null) {
                console.log('createObj failed for class:', className);
                return null;
            }
            // console.log('createObj OK, result=', result);
            const obj_id = result[0]._obj_id;
            const natObj = new ObjProxy(obj_id, className, this);
            return this.createWrapper(natObj);
        } catch (e) {
            console.log('createObj ERROR: ', e);
        }
        return null;
    }

}    
