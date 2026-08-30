/**
 * @file h3-kit/primitives/useDarkPortalClass.test.tsx
 * @description Contract for the kit's theme read.
 *
 * The kit used to learn the theme from an application context; it now reads
 * the `data-theme` attribute the theme provider writes on the document. What
 * has to hold for that swap to be invisible: the value is right on first
 * render (no flash of the wrong theme), it follows a later attribute change
 * (theme toggle), and the observer is released on unmount.
 */

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import { mountTree } from '../../__test__/helpers/testHarness';
import { useDarkPortalClass, useIsDarkTheme } from './useDarkPortalClass';

function Probe(): React.ReactElement {
    return <span data-testid="cls">{`[${useDarkPortalClass()}]`}</span>;
}

function setTheme(theme: string | null): void {
    if (theme === null) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
}

afterEach(() => setTheme(null));

describe('useDarkPortalClass', () => {
    it('reports the dark class when the document is already dark on mount', () => {
        setTheme('dark');
        const view = mountTree(<Probe />);
        expect(view.container.textContent).toBe('[bp5-dark]');
        view.unmount();
    });

    it('reports an empty class in the light theme, so it can be concatenated', () => {
        setTheme('light');
        const view = mountTree(<Probe />);
        expect(view.container.textContent).toBe('[]');
        view.unmount();
    });

    it('treats a document with no theme attribute as light', () => {
        const view = mountTree(<Probe />);
        expect(view.container.textContent).toBe('[]');
        view.unmount();
    });

    it('follows a theme change without a remount', async () => {
        setTheme('light');
        const view = mountTree(<Probe />);
        expect(view.container.textContent).toBe('[]');

        // MutationObserver delivers on a microtask, so the re-render it
        // triggers has to be flushed like any other event-driven update.
        await act(async () => {
            setTheme('dark');
            await Promise.resolve();
        });

        expect(view.container.textContent).toBe('[bp5-dark]');
        view.unmount();
    });

    it('stops observing once unmounted', async () => {
        setTheme('light');
        const view = mountTree(<Probe />);
        view.unmount();

        await act(async () => {
            setTheme('dark');
            await Promise.resolve();
        });
        // No update is attempted against the detached tree; React would warn.
        expect(view.container.textContent).toBe('');
    });

    it('exposes the raw boolean for callers that are not styling a portal', () => {
        setTheme('dark');
        function BoolProbe(): React.ReactElement {
            return <span>{String(useIsDarkTheme())}</span>;
        }
        const view = mountTree(<BoolProbe />);
        expect(view.container.textContent).toBe('true');
        view.unmount();
    });
});
