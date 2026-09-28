import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ViewLoopController } from '@renderer/worker/server/gfx/ViewLoopController';

/**
 * The render loop must update the scenes once per frame. SceneManager is a C++
 * idle task, so performIdleTasks already runs checkAndUpdateScenes; calling it
 * again from the loop drew an extra temporal-jitter sample every frame and
 * halved the frame rate while the view moved (AA High / Ultra).
 */
describe('ViewLoopController frame', () => {
    let rafCallbacks: Array<() => void>;

    beforeEach(() => {
        rafCallbacks = [];
        vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
            rafCallbacks.push(cb);
            return rafCallbacks.length;
        });
        vi.stubGlobal('cancelAnimationFrame', () => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function runOneFrame(cuemol: any, sceMgr: any, afterIdle = vi.fn()) {
        const loop = new ViewLoopController(cuemol, sceMgr, () => true, afterIdle);
        loop.startViewLoop(1);  // runs the first frame synchronously
    }

    it('pumps performIdleTasks once and does not call checkAndUpdateScenes again', () => {
        const order: string[] = [];
        const cuemol = { performIdleTasks: vi.fn(() => order.push('idle')) };
        const sceMgr = { invokeMethod: vi.fn() };
        runOneFrame(cuemol, sceMgr, vi.fn(() => order.push('afterIdle')));

        expect(sceMgr.invokeMethod).not.toHaveBeenCalled();
        expect(order).toEqual(['idle', 'afterIdle']);
        expect(rafCallbacks).toHaveLength(1);  // the next frame is scheduled
    });

    it('falls back to checkAndUpdateScenes for an addon without performIdleTasks', () => {
        const sceMgr = { invokeMethod: vi.fn() };
        runOneFrame({}, sceMgr);

        expect(sceMgr.invokeMethod).toHaveBeenCalledTimes(1);
        expect(sceMgr.invokeMethod).toHaveBeenCalledWith('checkAndUpdateScenes');
    });
});
