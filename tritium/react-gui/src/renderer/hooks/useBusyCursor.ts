/**
 * @file renderer/hooks/useBusyCursor.ts
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
 */

import { useEffect } from 'react';

/** Attribute set on `<html>` while the worker is busy. */
const BUSY_ATTR = 'data-busy';

/**
 * Apply/remove the global busy cursor.
 *
 * @param busy - Debounced busy flag, normally from `useCueMolBusy()`.
 */
export function useBusyCursor(busy: boolean): void {
    useEffect(() => {
        if (!busy) return;
        const root = document.documentElement;
        root.setAttribute(BUSY_ATTR, 'true');
        // Runs both when busy falls back to false and on unmount, so the
        // attribute can never be left stuck on.
        return () => {
            root.removeAttribute(BUSY_ATTR);
        };
    }, [busy]);
}
