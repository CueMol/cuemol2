/**
 * @file worker/client/transportPending.test.ts
 * @description What the transport owes a caller that is waiting on a reply.
 *
 * Three things, none of which held before:
 *   - a reply nobody is waiting for is dropped AND counted, so a
 *     fire-and-forget call that was given a sequence number by mistake shows
 *     up as a number rather than as nothing at all;
 *   - a deliberate `terminate()` settles every in-flight call, which only the
 *     crash path used to do -- so an awaited call survived the worker and hung
 *     for the life of the session;
 *   - the input forwarders post with NO_REPLY_SEQ, which is what stops the
 *     worker replying to them at all.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }));
vi.mock('@cuemol/core/src/BaseWrapper', () => ({
    BaseWrapper: class { constructor() { } },
}));

let capturedWorker: MockWorker | null = null;

class MockWorker {
    onmessage: ((ev: MessageEvent) => unknown) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor(_url: unknown) { capturedWorker = this; }
}

import { WorkerTransport } from '@renderer/worker/client/WorkerTransport';
import { onMouseEvent, onWheelEvent } from '@renderer/worker/client/apis/inputApi';
import { NO_REPLY_SEQ } from '@renderer/worker/shared/protocol';

describe('WorkerTransport pending calls', () => {
    let tr: WorkerTransport;

    beforeEach(() => {
        capturedWorker = null;
        vi.stubGlobal('Worker', MockWorker);
        tr = new WorkerTransport({ onEventNotify: () => undefined });
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('routes a reply to the call that is waiting for it', () => {
        const handler = vi.fn();
        tr.addListener('someCall', 7, handler);
        capturedWorker!.onmessage?.({ data: ['someCall', 7, true, 'v'] } as MessageEvent);

        expect(handler).toHaveBeenCalledWith(true, 'v');
        expect(tr.getStats().replies).toBe(1);
        expect(tr.getStats().orphanReplies).toBe(0);
    });

    it('delivers a reply once, then treats a repeat as an orphan', () => {
        const handler = vi.fn();
        tr.addListener('someCall', 7, handler);
        const msg = { data: ['someCall', 7, true, 'v'] } as MessageEvent;
        capturedWorker!.onmessage?.(msg);
        capturedWorker!.onmessage?.(msg);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(tr.getStats().orphanReplies).toBe(1);
    });

    it('counts a reply nobody asked for rather than throwing on it', () => {
        expect(() =>
            capturedWorker!.onmessage?.({ data: ['ghost', 99, true] } as MessageEvent),
        ).not.toThrow();
        expect(tr.getStats().orphanReplies).toBe(1);
    });

    it('settles every in-flight call when the worker is terminated', () => {
        const a = vi.fn();
        const b = vi.fn();
        tr.addListener('callA', 1, a);
        tr.addListener('callB', 2, b);

        tr.terminate();

        for (const fn of [a, b]) {
            expect(fn).toHaveBeenCalledTimes(1);
            const [ok, err] = fn.mock.calls[0] as [boolean, Error];
            expect(ok).toBe(false);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toMatch(/terminated/i);
        }
    });

    it('does not settle the same call twice after a terminate', () => {
        const handler = vi.fn();
        tr.addListener('callA', 1, handler);
        tr.terminate();
        capturedWorker!.onmessage?.({ data: ['callA', 1, true] } as MessageEvent);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(tr.getStats().orphanReplies).toBe(1);
    });
});

describe('input forwarders', () => {
    let tr: WorkerTransport;

    beforeEach(() => {
        capturedWorker = null;
        vi.stubGlobal('Worker', MockWorker);
        tr = new WorkerTransport({ onEventNotify: () => undefined });
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('post with NO_REPLY_SEQ, so the worker never answers them', () => {
        onMouseEvent(tr, 3, 'mouseMove', {
            clientX: 1, clientY: 2, screenX: 0, screenY: 0,
            offsetX: 1, offsetY: 2, buttons: 1, button: 0,
            ctrlKey: false, shiftKey: false,
        });
        onWheelEvent(tr, 3, { deltaX: 0, deltaY: 4, altKey: false });

        const posts = capturedWorker!.postMessage.mock.calls.map((c) => c[0] as unknown[]);
        expect(posts).toHaveLength(2);
        for (const p of posts) expect(p[1]).toBe(NO_REPLY_SEQ);
        expect(posts[0][0]).toBe('mouseMove');
        expect(posts[1][0]).toBe('wheel');
    });

    it('leaves the sequence counter alone, so real calls keep counting from 1', () => {
        onMouseEvent(tr, 3, 'mouseMove', {
            clientX: 0, clientY: 0, screenX: 0, screenY: 0,
            offsetX: 0, offsetY: 0, buttons: 0, button: 0,
            ctrlKey: false, shiftKey: false,
        });
        expect(tr.getSeqNo()).toBe(1);
    });
});
