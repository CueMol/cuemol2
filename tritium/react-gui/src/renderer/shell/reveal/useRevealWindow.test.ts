/**
 * @file renderer/shell/reveal/useRevealWindow.test.ts
 * @description When the renderer asks main to show its window.
 *
 * Main keeps the window hidden until this signal, so the signal must come
 * only when there is something to show: the shell's boot conditions met, no
 * pane still loading what it displays, and the frame with all of that in it
 * already painted.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { IPC } from '@shared/ipcChannels';
import { makeRenderHook, setupElectronAPI, teardownElectronAPI } from '@renderer/__test__/helpers/testHarness';
import { useHoldReveal, useRevealWindow } from './useRevealWindow';
import { holdReveal, resetRevealGate } from './revealGate';

let frames: FrameRequestCallback[] = [];
/** Run every animation-frame callback queued so far (one frame). */
function paint(): void {
    const due = frames;
    frames = [];
    for (const cb of due) cb(0);
}

describe('useRevealWindow', () => {
    let api: ReturnType<typeof setupElectronAPI>;
    beforeEach(() => {
        resetRevealGate();
        frames = [];
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            frames.push(cb);
            return frames.length;
        });
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        api = setupElectronAPI();
    });
    afterEach(() => {
        teardownElectronAPI();
        vi.unstubAllGlobals();
    });

    const reveals = (): number =>
        (api.invoke.mock.calls as unknown[][]).filter((c) => c[0] === IPC.WINDOW_REVEAL).length;

    it('signals after the second frame once ready, and not before ready', () => {
        let ready = false;
        const h = makeRenderHook(() => useRevealWindow(ready));
        act(() => paint());
        expect(reveals()).toBe(0);

        ready = true;
        h.rerender();
        act(() => paint());
        expect(reveals()).toBe(0);
        act(() => paint());
        expect(reveals()).toBe(1);
        h.unmount();
    });

    it('waits for a hold taken before it was ready', () => {
        const release = holdReveal();
        const h = makeRenderHook(() => useRevealWindow(true));
        act(() => { paint(); paint(); });
        expect(reveals()).toBe(0);

        act(() => release());
        act(() => { paint(); paint(); });
        expect(reveals()).toBe(1);
        h.unmount();
    });

    it('starts over when a hold arrives while it was waiting for the frames', () => {
        const h = makeRenderHook(() => useRevealWindow(true));
        act(() => paint());
        // A pane mounted in the same commit starts its load in an effect that
        // runs after ours, so its hold lands between the two frames.
        const release = holdReveal();
        act(() => paint());
        expect(reveals()).toBe(0);

        act(() => release());
        act(() => { paint(); paint(); });
        expect(reveals()).toBe(1);
        h.unmount();
    });

    it('useHoldReveal holds for exactly as long as the flag is on', () => {
        let on = true;
        const hold = makeRenderHook(() => useHoldReveal(on));
        const h = makeRenderHook(() => useRevealWindow(true));
        act(() => { paint(); paint(); });
        expect(reveals()).toBe(0);

        on = false;
        hold.rerender();
        act(() => { paint(); paint(); });
        expect(reveals()).toBe(1);
        hold.unmount();
        h.unmount();
    });
});
