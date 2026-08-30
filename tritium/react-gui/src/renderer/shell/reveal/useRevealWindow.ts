/**
 * @file renderer/shell/reveal/useRevealWindow.ts
 * @description Tell main this window has something worth showing.
 */

import { useEffect } from 'react';
import { IPC } from '@shared/ipcChannels';
import { holdReveal, onRevealClear, revealHolds } from './revealGate';

/**
 * Once `ready` is true and no hold is outstanding (revealGate.ts), wait for
 * the frame that has this render in it to be painted, then ask main to show
 * the window.
 *
 * Two animation frames: the first callback runs before the next paint, the
 * second after it. A hold taken while those frames were pending -- a pane
 * that mounted in the same commit and started a load in its effect -- is
 * respected: the attempt starts over when it clears.
 *
 * @param ready - the shell's own boot conditions, all met
 */
export function useRevealWindow(ready: boolean): void {
    useEffect(() => {
        if (!ready) return;
        let raf1 = 0;
        let raf2 = 0;
        let off: (() => void) | null = null;

        const attempt = (): void => {
            const afterPaint = (): void => {
                raf1 = requestAnimationFrame(() => {
                    raf2 = requestAnimationFrame(() => {
                        if (revealHolds() > 0) attempt();
                        else window.electronAPI?.invoke(IPC.WINDOW_REVEAL).catch(() => {});
                    });
                });
            };
            if (revealHolds() === 0) {
                afterPaint();
            } else {
                off = onRevealClear(() => {
                    off?.();
                    off = null;
                    afterPaint();
                });
            }
        };
        attempt();

        return () => {
            off?.();
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(raf2);
        };
    }, [ready]);
}

/** Keep the window off screen while `active` (a load in progress). */
export function useHoldReveal(active: boolean): void {
    useEffect(() => {
        if (!active) return;
        return holdReveal();
    }, [active]);
}
