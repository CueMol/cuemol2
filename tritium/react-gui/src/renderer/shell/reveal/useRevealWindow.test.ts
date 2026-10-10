/**
 * @file renderer/shell/reveal/useRevealWindow.test.ts
 * @description When the renderer asks main to show its window.
 *
 * Main keeps the window hidden until this signal, so the signal must come
 * only when there is something to show: the shell's boot conditions met and
 * no pane still loading what it displays. It must not wait for animation
 * frames, which a hidden window gets about once a second.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { IPC } from '@shared/ipcChannels';
import { makeRenderHook, setupElectronAPI, teardownElectronAPI } from '@renderer/__test__/helpers/testHarness';
import { useHoldReveal, useRevealWindow } from './useRevealWindow';
import { holdReveal, resetRevealGate } from './revealGate';

/** Run the tasks queued so far. */
function flush(): void {
    vi.runOnlyPendingTimers();
}

describe('useRevealWindow', () => {
    let api: ReturnType<typeof setupElectronAPI>;
    beforeEach(() => {
        resetRevealGate();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        // A hidden window's frames: none arrive while the signal is pending.
        vi.stubGlobal('requestAnimationFrame', vi.fn());
        api = setupElectronAPI();
    });
    afterEach(() => {
        teardownElectronAPI();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    const reveals = (): number =>
        (api.invoke.mock.calls as unknown[][]).filter((c) => c[0] === IPC.WINDOW_REVEAL).length;

    it('signals one task after ready, without waiting for a frame, and not before ready', () => {
        let ready = false;
        const h = makeRenderHook(() => useRevealWindow(ready));
        act(() => flush());
        expect(reveals()).toBe(0);

        ready = true;
        h.rerender();
        act(() => flush());
        expect(reveals()).toBe(1);
        expect(requestAnimationFrame).not.toHaveBeenCalled();
        h.unmount();
    });

    it('waits for a hold taken before it was ready', () => {
        const release = holdReveal();
        const h = makeRenderHook(() => useRevealWindow(true));
        act(() => flush());
        expect(reveals()).toBe(0);

        act(() => release());
        act(() => flush());
        expect(reveals()).toBe(1);
        h.unmount();
    });

    it('starts over when a hold arrives while its task was pending', () => {
        const h = makeRenderHook(() => useRevealWindow(true));
        // A pane mounted in the same commit starts its load in an effect that
        // runs after ours, so its hold lands before the task runs.
        const release = holdReveal();
        act(() => flush());
        expect(reveals()).toBe(0);

        act(() => release());
        act(() => flush());
        expect(reveals()).toBe(1);
        h.unmount();
    });

    it('useHoldReveal holds for exactly as long as the flag is on', () => {
        let on = true;
        const hold = makeRenderHook(() => useHoldReveal(on));
        const h = makeRenderHook(() => useRevealWindow(true));
        act(() => flush());
        expect(reveals()).toBe(0);

        on = false;
        hold.rerender();
        act(() => flush());
        expect(reveals()).toBe(1);
        hold.unmount();
        h.unmount();
    });
});
