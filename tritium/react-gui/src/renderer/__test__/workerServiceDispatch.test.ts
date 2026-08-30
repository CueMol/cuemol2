import { describe, it, expect, vi } from 'vitest';

// WorkerService's constructor calls getModule() and `new CueMol(...)`.
// Mock both so the class instantiates without the native C++ addon.
vi.mock('@cuemol/core', () => ({ getModule: () => ({}) }));
vi.mock('@cuemol/core/src/cuemol', () => ({
    CueMol: class CueMol {
        constructor(_opts: unknown) {
            void _opts;
        }
    },
}));

import { WorkerService } from '@renderer/worker/server/WorkerService';
import { NO_REPLY_SEQ } from '@renderer/worker/shared/protocol';

/**
 * Degrade-detection test for `WorkerService.invoke` -- the worker-side RPC
 * dispatcher.
 *
 * The react-gui refactor extracts the method implementations
 * (input events, lifecycle, text render) into separate
 * modules while `WorkerService` stays as the dispatch-table owner. This
 * test pins the *observable wire contract* of `invoke()` so the extraction
 * is provably behaviour-preserving:
 *   - which dispatch table (`_methods` vs `_registered`) a name routes to
 *   - the `[method, seqno, ok, ...payload]` shape posted back
 *   - sync (`_methods`) vs async (`_registered`) invocation semantics
 *   - the full set of built-in `_methods` keys
 */

type AnyFn = (...args: unknown[]) => unknown;

/** Resolve pending microtasks -- the `_registered` path chains two `.then`. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function makeSvc(): { svc: WorkerService; posted: unknown[][] } {
    const posted: unknown[][] = [];
    const svc = new WorkerService(
        (data: unknown[]) => {
            posted.push(data);
        },
        () => {},
    );
    return { svc, posted };
}

/** Inject a fake handler into the private `_methods` table. */
function injectMethod(svc: WorkerService, name: string, fn: AnyFn): void {
    (svc as unknown as { _methods: Record<string, AnyFn> })._methods[name] = fn;
}

/** Call the typed `register` with a test-only service name. */
function registerService(svc: WorkerService, name: string, fn: AnyFn): void {
    (svc.register as unknown as (n: string, f: AnyFn) => void)(name, fn);
}

describe('WorkerService.invoke dispatch contract', () => {
    it('_methods scalar return posts [method, seqno, true, result]', () => {
        const { svc, posted } = makeSvc();
        injectMethod(svc, 'testScalar', () => 42);
        svc.invoke('testScalar', 7, []);
        expect(posted).toEqual([['testScalar', 7, true, 42]]);
    });

    it('_methods array return spreads the result into the message tail', () => {
        const { svc, posted } = makeSvc();
        injectMethod(svc, 'testArr', () => [1, 2, 3]);
        svc.invoke('testArr', 8, []);
        expect(posted).toEqual([['testArr', 8, true, 1, 2, 3]]);
    });

    it('_methods receives the full args array as positional params', () => {
        const { svc, posted } = makeSvc();
        const spy = vi.fn((a: number, b: number) => a + b);
        injectMethod(svc, 'testArgs', spy as unknown as AnyFn);
        svc.invoke('testArgs', 1, [10, 20]);
        expect(spy).toHaveBeenCalledWith(10, 20);
        expect(posted).toEqual([['testArgs', 1, true, 30]]);
    });

    // The error must cross the wire as a string, matching the service branch.
    // Posting the raw thrown value risks a DataCloneError inside the catch --
    // a native exception is not necessarily structured-cloneable -- which
    // would escape self.onmessage and be funnelled as __worker_crash__,
    // turning one recoverable call failure into a whole-worker teardown.
    it('_methods throw posts [method, seqno, false, String(error)]', () => {
        const { svc, posted } = makeSvc();
        injectMethod(svc, 'testThrow', () => {
            throw new Error('boom');
        });
        svc.invoke('testThrow', 9, []);
        expect(posted).toEqual([['testThrow', 9, false, 'Error: boom']]);
    });

    it('_methods throw of a non-cloneable value still posts a plain string', () => {
        const { svc, posted } = makeSvc();
        // A value structuredClone() rejects (functions are not cloneable).
        const nonCloneable = { fn: () => undefined, toString: () => 'native abort' };
        injectMethod(svc, 'testThrowNative', () => {
            throw nonCloneable;
        });
        svc.invoke('testThrowNative', 11, []);
        expect(posted).toEqual([['testThrowNative', 11, false, 'native abort']]);
        expect(() => structuredClone(posted[0])).not.toThrow();
    });

    it('registered service runs async as fn(ctx, args[0]) and posts the result', async () => {
        const { svc, posted } = makeSvc();
        const spy = vi.fn((_ctx: unknown, arg: unknown) => ({ ok: true, echo: arg }));
        registerService(svc, 'testSvc', spy as unknown as AnyFn);
        svc.invoke('testSvc', 3, [{ x: 1 }]);
        // Service dispatch is async -- nothing is posted synchronously.
        expect(posted).toEqual([]);
        await flush();
        expect(spy).toHaveBeenCalledTimes(1);
        // First arg is the WorkerContext, second is args[0].
        expect((spy.mock.calls[0][0] as { svc: unknown }).svc).toBe(svc);
        expect(spy.mock.calls[0][1]).toEqual({ x: 1 });
        expect(posted).toEqual([['testSvc', 3, true, { ok: true, echo: { x: 1 } }]]);
    });

    it('rejected service posts [method, seqno, false, String(error)]', async () => {
        const { svc, posted } = makeSvc();
        registerService(svc, 'testFail', () => {
            throw new Error('svc-fail');
        });
        svc.invoke('testFail', 4, [null]);
        await flush();
        expect(posted).toEqual([['testFail', 4, false, 'Error: svc-fail']]);
    });

    it('unknown method posts [method, seqno, false] with no result element', () => {
        const { svc, posted } = makeSvc();
        svc.invoke('nonexistent', 5, []);
        expect(posted).toEqual([['nonexistent', 5, false]]);
    });

    it('_methods takes precedence when a name is in both tables', () => {
        const { svc, posted } = makeSvc();
        injectMethod(svc, 'dup', () => 'from-methods');
        registerService(svc, 'dup', () => 'from-service');
        svc.invoke('dup', 6, []);
        expect(posted).toEqual([['dup', 6, true, 'from-methods']]);
    });

    it('exposes the full built-in _methods dispatch table', () => {
        const { svc } = makeSvc();
        const methods = (svc as unknown as { _methods: Record<string, AnyFn> })
            ._methods;
        const expected = [
            'initCueMol', 'loadUserStyle', 'saveUserStyle', 'setViewInputConfigStyle',
            'terminateWorker',
            'hasClass', 'getAllClassNamesJSON',
            'addEventListener', 'removeEventListener',
            'bindCanvas', 'addView', 'activateView', 'removeView', 'resized',
            'mouseDown', 'mouseUp', 'mouseMove', 'wheel', 'gesture',
        ];
        for (const key of expected) {
            expect(typeof methods[key]).toBe('function');
        }
        expect(Object.keys(methods).sort()).toEqual([...expected].sort());
    });
});

/*
 * Fire-and-forget calls. The input forwarders have no result and nothing
 * awaits one, so they post with NO_REPLY_SEQ and the worker must stay silent.
 * Before this, every pointer event cost a reply that was posted,
 * structured-cloned, and dropped by a transport that had already forgotten
 * how to route it -- a second message per frame across a drag.
 */
describe('WorkerService.invoke no-reply contract', () => {
    it('says nothing back for a method called with NO_REPLY_SEQ', () => {
        const { svc, posted } = makeSvc();
        injectMethod(svc, 'mouseMove', () => undefined);
        svc.invoke('mouseMove', NO_REPLY_SEQ, [1, {}]);
        expect(posted).toEqual([]);
    });

    it('still replies to the same method when given a real sequence number', () => {
        const { svc, posted } = makeSvc();
        injectMethod(svc, 'mouseMove', () => undefined);
        svc.invoke('mouseMove', 5, [1, {}]);
        expect(posted).toHaveLength(1);
        expect(posted[0][1]).toBe(5);
    });

    it('stays silent even when the method throws', () => {
        // The caller is not listening, so an error has nowhere to go but the
        // worker log -- posting it would be the same wasted message.
        const { svc, posted } = makeSvc();
        injectMethod(svc, 'mouseMove', () => { throw new Error('boom'); });
        svc.invoke('mouseMove', NO_REPLY_SEQ, [1, {}]);
        expect(posted).toEqual([]);
    });

    it('stays silent for an unknown method', () => {
        const { svc, posted } = makeSvc();
        svc.invoke('neverRegistered', NO_REPLY_SEQ, []);
        expect(posted).toEqual([]);
    });

    it('stays silent for a registered service too', async () => {
        const { svc, posted } = makeSvc();
        registerService(svc, 'testNoReply', () => ({ ok: true }));
        svc.invoke('testNoReply', NO_REPLY_SEQ, [{}]);
        await flush();
        expect(posted).toEqual([]);
    });
});
