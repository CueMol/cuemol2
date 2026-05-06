const log = console;

function makeMethodSeq(method: string, seqno: number): string {
    return method + '.' + seqno.toString();
}

export type EventNotifyArgs = [number, string, number, number, number, string];

export interface WorkerTransportOptions {
    onEventNotify: (args: EventNotifyArgs) => void;
}

export class WorkerTransport {
    private _ready: boolean = false;
    private _seqno: number = 0;
    private _worker: Worker;
    private _worker_onmessage_dict: { [key: string]: any } = {};
    private _pendingCount: number = 0;
    private _busyListeners: Set<(busy: boolean) => void> = new Set();
    private _onEventNotify: (args: EventNotifyArgs) => void;

    constructor(opts: WorkerTransportOptions) {
        this._onEventNotify = opts.onEventNotify;
        log.info('launch worker...');
        this._worker = new Worker(new URL('../server/worker_launcher.ts', import.meta.url));
        log.info('launch worker OK');

        this._worker.onmessage = (event: MessageEvent) => {
            const [method, seqno, ...args] = event.data;

            if (method === 'event-notify') {
                const evtargs = event.data.slice(1) as EventNotifyArgs;
                try {
                    this._onEventNotify(evtargs);
                } catch (e) {
                    log.info('event manager notify failed:', e);
                }
                return;
            }

            const method_seq = makeMethodSeq(method, seqno);
            if (method_seq in this._worker_onmessage_dict) {
                this._worker_onmessage_dict[method_seq].apply(this, args);
                delete this._worker_onmessage_dict[method_seq];
            }
        };

        this._ready = true;
    }

    isReady(): boolean { return this._ready; }

    postMessage(method: string, seq: number, args: any[], xfer: any = null): void {
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

    private _incPending(): void {
        const wasBusy = this._pendingCount > 0;
        this._pendingCount++;
        if (!wasBusy) this._notifyBusyChange(true);
    }

    private _decPending(): void {
        if (this._pendingCount <= 0) return;
        this._pendingCount--;
        if (this._pendingCount === 0) this._notifyBusyChange(false);
    }

    private _notifyBusyChange(busy: boolean): void {
        for (const cb of this._busyListeners) {
            try { cb(busy); } catch (e) { log.warn('busy listener error:', e); }
        }
    }

    isBusy(): boolean { return this._pendingCount > 0; }

    subscribeBusy(cb: (busy: boolean) => void): () => void {
        this._busyListeners.add(cb);
        return () => { this._busyListeners.delete(cb); };
    }

    async invokeWorker(method: string, ...args: any[]): Promise<any[]> {
        const cur_seq = this.getSeqNo();
        this._incPending();
        const promise = new Promise<any[]>((resolve, reject) => {
            this.addListener(method, cur_seq, (result: boolean, ...msgargs: any[]): void => {
                try {
                    if (result) resolve(msgargs);
                    else reject(msgargs[0]);
                } finally {
                    this._decPending();
                }
            });
        });
        this.postMessage(method, cur_seq, args);
        return promise;
    }

    async invokeWorkerWithTransfer(method: string, transfer: any, ...args: any[]): Promise<any[]> {
        const cur_seq = this.getSeqNo();
        const promise = new Promise<any[]>((resolve, reject) => {
            this.addListener(method, cur_seq, (result: boolean, ...msgargs: any[]): void => {
                if (result) resolve(msgargs);
                else reject(msgargs[0]);
            });
        });
        this.postMessage(method, cur_seq, args, transfer);
        return promise;
    }

    terminate(): void {
        this._worker.terminate();
        this._ready = false;
    }
}
