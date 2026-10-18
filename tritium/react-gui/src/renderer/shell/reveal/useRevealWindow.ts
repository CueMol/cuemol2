/**
 * @file renderer/shell/reveal/useRevealWindow.ts
 * @description Tell main this window has something worth showing.
 */

import { useEffect } from 'react';
import { IPC } from '@shared/ipcChannels';
import { holdReveal, onRevealClear, revealHolds } from './revealGate';

/**
 * Once `ready` is true and no hold is outstanding (revealGate.ts), ask main
 * to show the window.
 *
 * The signal waits one task, not for a painted frame: the window is still
 * hidden, and Chromium gives a hidden window about one animation frame per
 * second (measured on Windows, where `visibilityState` still reads
 * "visible"), so waiting for frames held each window back 1-2 s. The task
 * runs after this commit's effects, so a hold taken there -- a pane that
 * mounted in the same commit and started a load -- is respected: the attempt
 * starts over when it clears. The window paints its current DOM as it is
 * shown.
 *
 * @param ready - the shell's own boot conditions, all met
 */
export function useRevealWindow(ready: boolean): void {
    useEffect(() => {
        if (!ready) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let off: (() => void) | null = null;

        const attempt = (): void => {
            const signal = (): void => {
                if (revealHolds() > 0) attempt();
                else window.electronAPI?.invoke(IPC.WINDOW_REVEAL).catch(() => {});
            };
            if (revealHolds() === 0) {
                timer = setTimeout(signal, 0);
            } else {
                off = onRevealClear(() => {
                    off?.();
                    off = null;
                    timer = setTimeout(signal, 0);
                });
            }
        };
        attempt();

        return () => {
            off?.();
            clearTimeout(timer);
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
