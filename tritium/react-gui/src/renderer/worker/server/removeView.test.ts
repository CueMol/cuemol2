/**
 * @file worker/server/removeView.test.ts
 * @description What closing a molview tab tears down in the worker, and in
 * what order.
 *
 * Until it destroyed anything, closing a tab left the C++ scene alive with
 * everything running: a looping animation kept its timer going and its view
 * kept drawing into the shared canvas over whatever was opened next, and
 * every closed scene stayed in memory. Destroying is only safe in one order
 * -- stop what is running, unbind, then destroy -- which is what these pin.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@cuemol/core', () => ({ getModule: () => ({}) }));
vi.mock('@cuemol/core/src/cuemol', () => ({
    CueMol: class CueMol {
        constructor(_opts: unknown) { void _opts; }
    },
}));

import { WorkerService } from './WorkerService';

/** A scene with the views it owns and an animation manager; logs what happens to it. */
function fakeScene(uid: number, viewIds: number[], log: string[]) {
    const views = new Set(viewIds);
    return {
        uid,
        views,
        getAnimMgr: () => ({ stop: () => { log.push(`anim.stop(${uid})`); } }),
        destroyView: vi.fn((id: number) => { log.push(`destroyView(${id})`); return views.delete(id); }),
        getViewCount: () => views.size,
    };
}

function setup(scenes: ReturnType<typeof fakeScene>[], log: string[]) {
    const svc = new WorkerService(() => {}, () => {});
    const gfx = { removeView: vi.fn((id: number) => { log.push(`gfx.removeView(${id})`); }) };
    const sceMgr = {
        getView: vi.fn((id: number) => {
            const scene = scenes.find((s) => s.views.has(id));
            return scene ? { getScene: () => scene } : null;
        }),
        destroyScene: vi.fn((uid: number) => {
            log.push(`destroyScene(${uid})`);
            const i = scenes.findIndex((s) => s.uid === uid);
            if (i >= 0) scenes.splice(i, 1);
            return i >= 0;
        }),
    };
    const priv = svc as unknown as { _gfx_mgr: unknown; _sceMgr: unknown };
    priv._gfx_mgr = gfx;
    priv._sceMgr = sceMgr;
    return { svc, gfx, sceMgr };
}

describe('WorkerService.removeView', () => {
    it('stops the animation, unbinds the view, then destroys the scene with its last view', () => {
        const log: string[] = [];
        const { svc } = setup([fakeScene(1, [7], log)], log);
        expect(svc.removeView(7)).toBe(true);
        expect(log).toEqual(['anim.stop(1)', 'gfx.removeView(7)', 'destroyScene(1)']);
    });

    it('destroys only the view while the scene still has another', () => {
        const log: string[] = [];
        const scene = fakeScene(1, [7, 8], log);
        const { svc, sceMgr } = setup([scene], log);
        svc.removeView(7);
        expect(log).toEqual(['anim.stop(1)', 'gfx.removeView(7)', 'destroyView(7)']);
        expect(sceMgr.destroyScene).not.toHaveBeenCalled();

        log.length = 0;
        svc.removeView(8);
        expect(log).toEqual(['anim.stop(1)', 'gfx.removeView(8)', 'destroyScene(1)']);
    });

    it('tolerates a view the scene manager no longer knows', () => {
        const log: string[] = [];
        const { svc, sceMgr } = setup([fakeScene(1, [7], log)], log);
        expect(svc.removeView(99)).toBe(true);
        // The canvas binding still goes; there is just nothing to destroy.
        expect(log).toEqual(['gfx.removeView(99)']);
        expect(sceMgr.destroyScene).not.toHaveBeenCalled();
    });

    it('reports failure only when the gfx manager is not up', () => {
        const svc = new WorkerService(() => {}, () => {});
        expect(svc.removeView(7)).toBe(false);
    });
});
