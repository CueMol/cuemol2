// Runs in Web Worker thread. Shared streaming logic used by
// streamLoadFromUrl (coordinate files) and streamLoadDensityMap (electron
// density maps). Mirrors the UXP `StreamListener` + `forceCancel` flow in
// uxp_gui/cuemol2/base/content/tools/netpdbopen.js.

import type { WorkerContext } from '../../types/WorkerContext';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';
import type { ByteArray } from '@cuemol/core/src/wrappers/ByteArray';
import type { Object as CObject } from '@cuemol/core/src/wrappers/Object';

const log = console;

// reqId → AbortController for in-flight streams. Worker module-local;
// concurrent downloads identify themselves by reqId. Shared between every
// stream*-style service so that one cancelStream(reqId) call works
// regardless of which service started the request.
const activeReqs = new Map<string, AbortController>();

export interface StreamFetchToReaderArgs {
    reqId: string;
    url: string;
    /** Reader handler that has already been created and configured by the caller. */
    reader: ObjReader;
}

export interface StreamFetchToReaderResult {
    obj: CObject | null;
    canceled: boolean;
}

/**
 * Stream-fetch `args.url` and feed each chunk into `args.reader` via
 * StreamManager.supplyDataAsync. Posts a 'stream-progress' message per chunk
 * with the cumulative byte count. Always calls waitLoadAsync to drain the
 * IOThread on every exit path (success / cancel / error) — matches UXP
 * forceCancel (netpdbopen.js:107). Throws on HTTP error; returns
 * `{ canceled: true, obj: null }` when the request was aborted.
 */
export async function streamFetchToReader(
    ctx: WorkerContext,
    args: StreamFetchToReaderArgs,
): Promise<StreamFetchToReaderResult> {
    const tid = ctx.strMgr.loadObjectAsync(args.reader);

    const ac = new AbortController();
    activeReqs.set(args.reqId, ac);

    let canceled = false;
    let httpError: Error | null = null;

    try {
        const resp = await fetch(args.url, { signal: ac.signal });
        if (!resp.ok || !resp.body) {
            throw new Error(`HTTP ${resp.status} for ${args.url}`);
        }

        const rstream = resp.body.getReader();
        let bytes = 0;
        for (;;) {
            const { done, value } = await rstream.read();
            if (done) break;
            const ba = ctx.svc.fromTypedArray(value) as ByteArray;
            ctx.strMgr.supplyDataAsync(tid, ba, value.byteLength);
            bytes += value.byteLength;
            (self as unknown as Worker).postMessage(['stream-progress', args.reqId, bytes]);
        }
    } catch (e) {
        if (ac.signal.aborted) {
            canceled = true;
            log.info(`[worker] streamFetchToReader canceled: reqId=${args.reqId}`);
        } else {
            httpError = e instanceof Error ? e : new Error(String(e));
            log.error('[worker] streamFetchToReader failed:', httpError);
        }
    }

    let obj: CObject | null = null;
    try {
        obj = ctx.strMgr.waitLoadAsync(tid) as unknown as CObject;
    } catch (e) {
        log.warn('[worker] waitLoadAsync threw during cleanup:', e);
    }
    activeReqs.delete(args.reqId);

    if (httpError) throw httpError;
    if (canceled) return { obj: null, canceled: true };
    return { obj, canceled: false };
}

/**
 * Abort the in-flight request for `reqId`, if any. Returns true if a
 * matching request was aborted, false if no such request was active.
 */
export function cancelStream(reqId: string): boolean {
    const ac = activeReqs.get(reqId);
    if (!ac) return false;
    ac.abort();
    return true;
}
