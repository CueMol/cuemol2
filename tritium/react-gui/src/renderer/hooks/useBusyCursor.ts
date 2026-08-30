/**
 * @file hooks/useBusyCursor.ts
 * @description Reflects the CueMol busy state onto the document root as a
 * `data-busy` attribute, which `styles/_base.css` turns into a global wait
 * cursor.
 *
 * The status bar sits at the very bottom of the window, far from where the
 * user is looking (3D viewport, side panels), so the "Busy" label alone is
 * easy to miss. Changing the pointer itself signals the wait regardless of
 * where the cursor is.
 *
 * The hook takes `busy` as a parameter instead of calling `useCueMolBusy()`
 * itself: every `useCueMolBusy()` call opens its own worker subscription and
 * its own debounce timer, so App passes down the single value it already has.
 *
 * On top of that shared debounce the cursor waits again (see
 * `CURSOR_RISING_EDGE_DELAY_MS`). The pointer sits under the user's hand and
 * swapping it mid-interaction is the most intrusive busy signal we have, so it
 * should appear only for waits long enough to be worth interrupting for --
 * a higher bar than the status-bar pill, which is passive and can flip sooner.
 */

import { useEffect } from 'react';

/** Attribute set on `<html>` while the worker is busy. */
const BUSY_ATTR = 'data-busy';

/**
 * Extra rising-edge delay before the wait cursor appears, on top of the
 * debounce already applied by `useCueMolBusy`. Sized so that operations that
 * finish in roughly half a second never flip the pointer: those read as
 * instantaneous, and a cursor that blinks to "wait" and straight back is more
 * distracting than no feedback at all. The falling edge stays immediate --
 * the cursor is restored the moment the work ends.
 */
const CURSOR_RISING_EDGE_DELAY_MS = 400;

/**
 * Apply/remove the global busy cursor.
 *
 * @param busy - Debounced busy flag, normally from `useCueMolBusy()`.
 */
export function useBusyCursor(busy: boolean): void {
    useEffect(() => {
        if (!busy) return;
        const root = document.documentElement;
        const timer = setTimeout(() => {
            root.setAttribute(BUSY_ATTR, 'true');
        }, CURSOR_RISING_EDGE_DELAY_MS);
        // Runs both when busy falls back to false and on unmount, so a pending
        // timer never fires late and the attribute can never be left stuck on.
        return () => {
            clearTimeout(timer);
            root.removeAttribute(BUSY_ATTR);
        };
    }, [busy]);
}
