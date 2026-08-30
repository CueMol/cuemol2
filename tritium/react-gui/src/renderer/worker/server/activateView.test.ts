/**
 * @file worker/server/activateView.test.ts
 * @description Activating a view pauses the animations left behind.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@cuemol/core', () => ({ getModule: () => ({}) }));
vi.mock('@cuemol/core/src/cuemol', () => ({
    CueMol: class CueMol {
        constructor(_opts: unknown) { void _opts; }
    },
}));
const pause = vi.hoisted(() => vi.fn(() => [] as number[]));
vi.mock('@renderer/worker/server/services/animation.service', () => ({
    pauseInactivePlayback: pause,
    pumpAnimProgress: vi.fn(),
    forgetAnimProgress: vi.fn(),
}));
const rendering = vi.hoisted(() => vi.fn(() => false));
vi.mock('@renderer/worker/server/services/renderJob.service', () => ({ isSceneBeingRendered: rendering }));

import { WorkerService } from './WorkerService';

function setup(viewScene: Record<number, number>) {
    const svc = new WorkerService(() => {}, () => {});
    const gfx = { activateView: vi.fn() };
    const sceMgr = {
        getView: vi.fn((id: number) =>
            id in viewScene ? { getScene: () => ({ uid: viewScene[id] }) } : null),
    };
    const priv = svc as unknown as { _gfx_mgr: unknown; _sceMgr: unknown };
    priv._gfx_mgr = gfx;
    priv._sceMgr = sceMgr;
    return { svc, gfx };
}

describe('WorkerService.activateView', () => {
    it('drives the view, then pauses playback everywhere but its scene', () => {
        const { svc, gfx } = setup({ 7: 100 });
        svc.activateView(7);
        expect(gfx.activateView).toHaveBeenCalledWith(7);
        expect(pause).toHaveBeenCalledWith(expect.anything(), 100, rendering);
    });

    it('does not pause anything when the view is unknown', () => {
        pause.mockClear();
        const { svc } = setup({});
        svc.activateView(99);
        expect(pause).not.toHaveBeenCalled();
    });
});
