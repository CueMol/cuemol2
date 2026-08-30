/**
 * @file main/windows/reveal.test.ts
 * @description The three ways a held-back window ends up on screen.
 *
 * A window is created hidden and shown when its renderer says so. That signal
 * can come, can come late, or can never come; the fallback armed by
 * `ready-to-show` covers the last, and a second signal or a signal for a
 * window that closed meanwhile must do nothing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { holdUntilRevealed, revealWindow, REVEAL_FALLBACK_MS } from './reveal';

type Listener = () => void;

function makeWindow() {
    const once = new Map<string, Listener[]>();
    let destroyed = false;
    return {
        isDestroyed: () => destroyed,
        once: vi.fn((event: string, cb: Listener) => {
            once.set(event, [...(once.get(event) ?? []), cb]);
        }),
        fire(event: string) {
            const cbs = once.get(event) ?? [];
            once.delete(event);
            for (const cb of cbs) cb();
        },
        destroy() {
            destroyed = true;
            this.fire('closed');
        },
    };
}

describe('holdUntilRevealed', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('reveals on the signal, exactly once', () => {
        const win = makeWindow();
        const reveal = vi.fn();
        holdUntilRevealed(win as never, reveal);
        expect(reveal).not.toHaveBeenCalled();

        revealWindow(win as never);
        revealWindow(win as never);
        expect(reveal).toHaveBeenCalledTimes(1);
    });

    it('does not reveal on ready-to-show, which fires before the page has content', () => {
        const win = makeWindow();
        const reveal = vi.fn();
        holdUntilRevealed(win as never, reveal);

        win.fire('ready-to-show');
        expect(reveal).not.toHaveBeenCalled();
    });

    it('falls back to revealing a while after ready-to-show when no signal comes', () => {
        const win = makeWindow();
        const reveal = vi.fn();
        holdUntilRevealed(win as never, reveal);

        win.fire('ready-to-show');
        vi.advanceTimersByTime(REVEAL_FALLBACK_MS - 1);
        expect(reveal).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(reveal).toHaveBeenCalledTimes(1);

        // The late signal finds nothing left to do.
        revealWindow(win as never);
        expect(reveal).toHaveBeenCalledTimes(1);
    });

    it('lets the signal cancel the fallback', () => {
        const win = makeWindow();
        const reveal = vi.fn();
        holdUntilRevealed(win as never, reveal);

        win.fire('ready-to-show');
        revealWindow(win as never);
        vi.advanceTimersByTime(REVEAL_FALLBACK_MS);
        expect(reveal).toHaveBeenCalledTimes(1);
    });

    it('does nothing for a window that closed while waiting', () => {
        const win = makeWindow();
        const reveal = vi.fn();
        holdUntilRevealed(win as never, reveal);

        win.fire('ready-to-show');
        win.destroy();
        revealWindow(win as never);
        vi.advanceTimersByTime(REVEAL_FALLBACK_MS);
        expect(reveal).not.toHaveBeenCalled();
    });

    it('ignores a signal from a window it is not holding', () => {
        expect(() => revealWindow(makeWindow() as never)).not.toThrow();
    });
});
