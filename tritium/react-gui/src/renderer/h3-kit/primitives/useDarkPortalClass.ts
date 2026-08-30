/**
 * @file h3-kit/primitives/useDarkPortalClass.ts
 * @description The kit's own read of the active theme.
 *
 * Blueprint styles its components from a `bp5-dark` class, and a portal
 * (popover, dialog, tooltip) mounts outside the tree that carries it -- so
 * every portal owner has to pass the class down itself. That produced the same
 * `theme === 'dark' ? 'bp5-dark' : ''` expression in three dozen places, and
 * inside the kit it also meant a form field importing an application context
 * just to learn one boolean.
 *
 * The theme is already published on the document: `ThemeProvider` writes
 * `data-theme` on `documentElement` so the CSS custom properties can key off
 * it. Reading it back here gives the kit a dependency-free answer that is
 * correct in either window, and `useSyncExternalStore` keeps it honest when
 * the attribute changes.
 */

import { useSyncExternalStore } from 'react';

/** Blueprint's dark-mode class. Empty string means "inherit light". */
export const DARK_PORTAL_CLASS = 'bp5-dark';

function subscribe(onChange: () => void): () => void {
    if (typeof MutationObserver === 'undefined') return () => undefined;
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
}

function readIsDark(): boolean {
    return document.documentElement.getAttribute('data-theme') === 'dark';
}

/**
 * True while the document is in the dark theme.
 *
 * Prefer {@link useDarkPortalClass} when the value is only going to be handed
 * to a `portalClassName` / `className` prop.
 */
export function useIsDarkTheme(): boolean {
    return useSyncExternalStore(subscribe, readIsDark, readIsDark);
}

/**
 * The class a portal must carry to be styled by the current theme:
 * `'bp5-dark'` in the dark theme, `''` otherwise.
 *
 * Empty string rather than `undefined` so it can be concatenated with a
 * caller's own classes without a guard.
 */
export function useDarkPortalClass(): string {
    return useIsDarkTheme() ? DARK_PORTAL_CLASS : '';
}
