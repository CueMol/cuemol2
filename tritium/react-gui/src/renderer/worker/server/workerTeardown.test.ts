/**
 * @file worker/server/workerTeardown.test.ts
 * @description The worker hands its event-manager subscription back before
 * closing.
 *
 * The C++ event manager holds the callback the worker registers at init. The
 * listener id used to be dropped on the floor -- there was a `TODO:
 * removeListener ??` where the unsubscribe belonged -- which is harmless only
 * while the worker lives exactly as long as the app. Re-initialise one and the
 * old callback stays subscribed alongside the new one, so every event is
 * delivered twice, into a closure holding the previous worker's postMessage.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@cuemol/core', () => ({ getModule: () => ({}) }));

const LISTENER_ID = 77;

/** The pieces of the CueMol facade `initCueMol` reaches for. */
const evtMgr = {
    append: vi.fn(() => 1),
    addListener: vi.fn(() => LISTENER_ID),
    removeListener: vi.fn(),
};

vi.mock('@cuemol/core/src/cuemol', () => ({
    CueMol: class CueMol {
        constructor(_opts: unknown) { void _opts; }
        initCueMol(_p?: string) { void _p; }
        getSceneManager() { return {}; }
        getService(name: string) {
            return name === 'ScrEventManager' ? evtMgr : {};
        }
    },
}));

vi.mock('@renderer/worker/server/gfx_manager', () => ({
    GfxManager: class { constructor(..._a: unknown[]) { void _a; } },
}));

import { WorkerService } from '@renderer/worker/server/WorkerService';

describe('WorkerService teardown', () => {
    it('removes the event-manager listener it registered at init', () => {
        const svc = new WorkerService(() => undefined, () => undefined);
        svc.initCueMol();
        expect(evtMgr.addListener).toHaveBeenCalledTimes(1);

        svc.terminateWorker();

        expect(evtMgr.removeListener).toHaveBeenCalledTimes(1);
        expect(evtMgr.removeListener).toHaveBeenCalledWith(LISTENER_ID);
    });

    it('closes even if the C++ side refuses the unsubscribe', () => {
        evtMgr.removeListener.mockClear();
        evtMgr.removeListener.mockImplementationOnce(() => {
            throw new Error('already gone');
        });
        const close = vi.fn();
        const svc = new WorkerService(() => undefined, close);
        svc.initCueMol();

        expect(() => svc.terminateWorker()).not.toThrow();
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('does not unsubscribe twice', () => {
        evtMgr.removeListener.mockClear();
        const svc = new WorkerService(() => undefined, () => undefined);
        svc.initCueMol();

        svc.terminateWorker();
        svc.terminateWorker();

        expect(evtMgr.removeListener).toHaveBeenCalledTimes(1);
    });
});
