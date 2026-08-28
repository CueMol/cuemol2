/**
 * @file renderer/worker/client/WorkerTransport.ts
 * @description Renderer-side handle for the Web Worker process.
 *
 * Owns the `Worker` instance, allocates per-call sequence numbers, routes
 * replies back to their callers, and exposes typed `invokeService<K>` /
 * `invokeMethod<K>` / `invokeRpc<K>` helpers built on top of the low-level
 * `invokeWorker` array-tail protocol. Also fans out `event-notify`,
 * `stream-progress` and `render-progress` push messages to subscribers.
 */
import type {
    MethodArgs,
    MethodKey,
    MethodResult,
    RpcArgs,
    RpcKey,
    RpcResult,
    ServiceArgs,
    ServiceKey,
    ServiceResult,
} from '../shared/WorkerCalls';
import type { RenderUpdate } from '../shared/renderTypes';
import { RENDER_PROGRESS_CHANNEL } from '../shared/renderTypes';
import type { ApbsUpdate } from '../shared/apbsTypes';
import { APBS_PROGRESS_CHANNEL } from '../shared/apbsTypes';
import type { CrashSource } from '@shared/ipcTypes';
import { report as reportCrash } from '../../crash/CrashReporter';

const log = console;

/** Build the per-call dispatch key from a method name and sequence number. */
function makeMethodSeq(method: string, seqno: number): string {
    return method + '.' + seqno.toString();
}

/**
 * Payload tuple for a worker `event-notify` push:
 * `[slot, category, srcCat, evtType, srcUID, evtStr]`.
 */
export type EventNotifyArgs = [number, string, number, number, number, string];

/**
 * Listener for `stream-progress` push messages.
 *
 * @param reqId - Stream-request identifier issued by the worker.
 * @param bytes - Cumulative bytes transferred so far.
 */
export type StreamProgressListener = (reqId: string, bytes: number) => void;

/** Listener for `render-progress` push messages from `renderJob`. */
export type RenderProgressListener = (update: RenderUpdate) => void;

/** Listener for `apbs-progress` push messages from `calcApbsPot`. */
export type ApbsProgressListener = (update: ApbsUpdate) => void;

/** Construction options for {@link WorkerTransport}. */
export interface WorkerTransportOptions {
    /** Forwarder for `event-notify` payloads (typically routes to `EventSlots.notify`). */
    onEventNotify: (args: EventNotifyArgs) => void;
}

/**
 * Web Worker transport. One instance per renderer process; owned by
 * `AsyncCueMol`.
 */
export class WorkerTransport {
    private _ready: boolean = false;
    private _crashed: boolean = false;
    private _seqno: number = 0;
    private _worker: Worker;
    private _worker_onmessage_dict: { [key: string]: any } = {};
    private _pendingCount: number = 0;
    private _busyListeners: Set<(busy: boolean) => void> = new Set();
    private _onEventNotify: (args: EventNotifyArgs) => void;
    private _streamProgressListeners: Set<StreamProgressListener> = new Set();
    private _renderProgressListeners: Set<RenderProgressListener> = new Set();
    private _apbsProgressListeners: Set<ApbsProgressListener> = new Set();

    /**
     * Spawn the Web Worker (entry: `../server/worker_launcher.ts`) and
     * install the `onmessage` dispatcher.
     *
     * @param opts - `onEventNotify` handler used for `event-notify` push
     *   messages.
     */
    constructor(opts: WorkerTransportOptions) {
        this._onEventNotify = opts.onEventNotify;
        log.info('launch worker...');
        this._worker = new Worker(new URL('../server/worker_launcher.ts', import.meta.url));
        log.info('launch worker OK');

        // Native worker termination signal -- e.g. an unhandled throw in a
        // worker event handler not caught by the launcher's global error
        // listener, or a runtime-level kill. After this fires, further
        // postMessage calls are silently dropped, so mark the transport
        // crashed and reject any in-flight calls.
        this._worker.onerror = (e: ErrorEvent) => {
            this._handleWorkerCrash('worker-global', {
                message: e.message || '(worker error)',
                stack: (e.error instanceof Error) ? e.error.stack : undefined,
                filename: e.filename || undefined,
                lineno: e.lineno || undefined,
                colno: e.colno || undefined,
            });
        };

        // Structured-clone failure on a postMessage payload. The worker is
        // technically alive but data is now out of sync with our reply
        // dispatch, so treat it as fatal too.
        this._worker.onmessageerror = () => {
            this._handleWorkerCrash('worker-global', {
                message: 'Worker postMessage deserialization failed',
            });
        };

        this._worker.onmessage = (event: MessageEvent) => {
            // Crash report posted from inside the worker (launcher global
            // handlers or render-loop try-catch). Branch before normal
            // dispatch so it does not collide with method names.
            if (Array.isArray(event.data) && event.data[0] === '__worker_crash__') {
                const p = event.data[1] ?? {};
                const isRenderLoop = p && p.type === 'render-loop';
                this._handleWorkerCrash(
                    isRenderLoop ? 'worker-render-loop' : 'worker-message',
                    {
                        message: typeof p.message === 'string' ? p.message : '(worker crash)',
                        stack: typeof p.stack === 'string' ? p.stack : undefined,
                        filename: typeof p.filename === 'string' ? p.filename : undefined,
                        lineno: typeof p.lineno === 'number' ? p.lineno : undefined,
                        colno: typeof p.colno === 'number' ? p.colno : undefined,
                    },
                );
                return;
            }

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

            if (method === 'stream-progress') {
                // event.data shape: ['stream-progress', reqId, bytes]
                const [reqId, bytes] = event.data.slice(1) as [string, number];
                for (const cb of this._streamProgressListeners) {
                    try { cb(reqId, bytes); } catch (e) { log.warn('stream-progress listener:', e); }
                }
                return;
            }

            if (method === RENDER_PROGRESS_CHANNEL) {
                // event.data shape: ['render-progress', RenderUpdate]
                const [update] = event.data.slice(1) as [RenderUpdate];
                for (const cb of this._renderProgressListeners) {
                    try { cb(update); } catch (e) { log.warn('render-progress listener:', e); }
                }
                return;
            }

            if (method === APBS_PROGRESS_CHANNEL) {
                // event.data shape: ['apbs-progress', ApbsUpdate]
                const [update] = event.data.slice(1) as [ApbsUpdate];
                for (const cb of this._apbsProgressListeners) {
                    try { cb(update); } catch (e) { log.warn('apbs-progress listener:', e); }
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

    /**
     * Subscribe to `stream-progress` push messages.
     *
     * @returns An unsubscribe function.
     */
    subscribeStreamProgress(cb: StreamProgressListener): () => void {
        this._streamProgressListeners.add(cb);
        return () => { this._streamProgressListeners.delete(cb); };
    }

    /**
     * Subscribe to `render-progress` push messages from `renderJob`.
     *
     * @returns An unsubscribe function.
     */
    subscribeRenderProgress(cb: RenderProgressListener): () => void {
        this._renderProgressListeners.add(cb);
        return () => { this._renderProgressListeners.delete(cb); };
    }

    /**
     * Subscribe to `apbs-progress` push messages from `calcApbsPot`.
     *
     * @returns An unsubscribe function.
     */
    subscribeApbsProgress(cb: ApbsProgressListener): () => void {
        this._apbsProgressListeners.add(cb);
        return () => { this._apbsProgressListeners.delete(cb); };
    }

    /** Whether the worker has been launched and not yet terminated. */
    isReady(): boolean { return this._ready; }

    /**
     * Whether the worker has crashed. After this becomes true any pending
     * `invokeWorker` is rejected and new calls are rejected synchronously.
     */
    isCrashed(): boolean { return this._crashed; }

    /**
     * Funnel for every worker-side crash signal (`onerror`,
     * `onmessageerror`, and the worker-posted `__worker_crash__` message).
     * Reports through the renderer-wide CrashReporter and tears the worker
     * down so further calls fail fast instead of hanging forever.
     */
    private _handleWorkerCrash(
        source: Extract<CrashSource, 'worker-global' | 'worker-message' | 'worker-render-loop'>,
        payload: { message: string; stack?: string; filename?: string; lineno?: number; colno?: number },
    ): void {
        if (this._crashed) {
            // Already handled -- a single crash often surfaces through
            // multiple channels (postMessage + re-throw -> onerror).
            return;
        }
        this._crashed = true;
        this._ready = false;
        reportCrash({
            source,
            message: payload.message,
            stack: payload.stack,
            filename: payload.filename,
            lineno: payload.lineno,
            colno: payload.colno,
            timestamp: Date.now(),
        });
        // Reject every pending call so callers do not hang waiting on a
        // dead worker.
        const err = new Error('Worker crashed: ' + payload.message);
        const pending = this._worker_onmessage_dict;
        this._worker_onmessage_dict = {};
        for (const key in pending) {
            try { pending[key].call(this, false, err); } catch { /* ignore */ }
        }
        try { this._worker.terminate(); } catch { /* worker may already be dead */ }
    }

    /**
     * Low-level send. Bypasses the busy counter; used by typed helpers and
     * by fire-and-forget event forwarders.
     *
     * @param method - Worker-side handler name.
     * @param seq - Sequence number from {@link getSeqNo}.
     * @param args - Positional arguments forwarded to the worker.
     * @param xfer - Optional `Transferable` (used by `bindCanvas`).
     */
    postMessage(method: string, seq: number, args: any[], xfer: any = null): void {
        if (xfer === null)
            this._worker.postMessage([method, seq, ...args]);
        else
            this._worker.postMessage([method, seq, ...args], [xfer]);
    }

    /** Allocate the next call sequence number. */
    getSeqNo(): number {
        this._seqno++;
        return this._seqno;
    }

    /**
     * Register a one-shot reply handler keyed by `method.seqno`. Consumed
     * by `onmessage` when the worker replies, then deleted.
     */
    addListener(method: string, seqno: number, handler: any): void {
        const method_seq = makeMethodSeq(method, seqno);
        this._worker_onmessage_dict[method_seq] = handler;
    }

    /** Increment the pending-call counter, firing `busy=true` on rising edge. */
    private _incPending(): void {
        const wasBusy = this._pendingCount > 0;
        this._pendingCount++;
        if (!wasBusy) this._notifyBusyChange(true);
    }

    /** Decrement the pending-call counter, firing `busy=false` at zero. */
    private _decPending(): void {
        if (this._pendingCount <= 0) return;
        this._pendingCount--;
        if (this._pendingCount === 0) this._notifyBusyChange(false);
    }

    /** Fan-out helper invoked when the pending-call edge crosses zero. */
    private _notifyBusyChange(busy: boolean): void {
        for (const cb of this._busyListeners) {
            try { cb(busy); } catch (e) { log.warn('busy listener error:', e); }
        }
    }

    /** Whether at least one tracked call is currently in flight. */
    isBusy(): boolean { return this._pendingCount > 0; }

    /**
     * Subscribe to busy-state edges.
     *
     * @param cb - Called with `true` when the first call goes pending and
     *   `false` when the last call resolves.
     * @returns An unsubscribe function.
     */
    subscribeBusy(cb: (busy: boolean) => void): () => void {
        this._busyListeners.add(cb);
        return () => { this._busyListeners.delete(cb); };
    }

    /**
     * Raw worker call. Returns the worker reply as the `args` tail of the
     * message; reject on a `result === false` reply.
     *
     * @param method - Worker-side handler name.
     * @param args - Positional arguments.
     * @returns The trailing args of the worker's reply message.
     * @remarks Tracked by the busy counter. Prefer the typed helpers
     *   ({@link invokeService}, {@link invokeMethod}, {@link invokeRpc})
     *   for any new call site.
     */
    async invokeWorker(method: string, ...args: any[]): Promise<any[]> {
        if (this._crashed) {
            throw new Error('Worker has crashed; ' + method + ' call rejected');
        }
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

    /**
     * Raw worker call carrying a `Transferable`. Used by `bindCanvas` to
     * hand off an `OffscreenCanvas`.
     *
     * @param method - Worker-side handler name.
     * @param transfer - The `Transferable` (passed in the `[transfer]`
     *   list).
     * @param args - Positional arguments.
     * @returns The trailing args of the worker's reply.
     * @remarks **Not** tracked by the busy counter (one-shot init only).
     */
    async invokeWorkerWithTransfer(method: string, transfer: any, ...args: any[]): Promise<any[]> {
        if (this._crashed) {
            throw new Error('Worker has crashed; ' + method + ' call rejected');
        }
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

    // --- Typed call helpers ---
    // Preferred over `invokeWorker` for new code. Each helper wraps the
    // array-tail response into the single-value contract documented by
    // the corresponding map in `worker/shared/WorkerCalls.ts`.

    /**
     * Call a worker service (`ServiceMap` entry).
     *
     * @param name - Service key (compile-checked against `ServiceMap`).
     * @param args - Service request payload.
     */
    async invokeService<K extends ServiceKey>(name: K, args: ServiceArgs<K>): Promise<ServiceResult<K>> {
        const result = await this.invokeWorker(name, args);
        return result[0] as ServiceResult<K>;
    }

    /**
     * Call a worker variadic method (`MethodMap` entry -- infrastructure /
     * hot-path events such as `bindCanvas` or `mouseMove`).
     *
     * @param name - Method key.
     * @param args - Variadic argument tuple.
     */
    async invokeMethod<K extends MethodKey>(name: K, ...args: MethodArgs<K>): Promise<MethodResult<K>> {
        const result = await this.invokeWorker(name, ...args);
        return result[0] as MethodResult<K>;
    }

    /**
     * Call a worker RPC handler (`RpcMap` entry -- class-registry queries
     * `hasClass` / `getAllClassNamesJSON`).
     *
     * @param name - RPC key.
     * @param args - Variadic argument tuple.
     */
    async invokeRpc<K extends RpcKey>(name: K, ...args: RpcArgs<K>): Promise<RpcResult<K>> {
        const result = await this.invokeWorker(name, ...args);
        return result[0] as RpcResult<K>;
    }

    /**
     * Terminate the underlying `Worker`. After this, `isReady()` returns
     * false and no further calls may be made.
     */
    terminate(): void {
        this._worker.terminate();
        this._ready = false;
    }
}
