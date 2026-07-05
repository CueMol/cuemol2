/**
 * @file __test__/useTabManager.test.ts
 * @description Contract tests for the tab manager: molview tab title sync
 * keeps the tab strip aligned with scene renames without state churn.
 */

import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { makeRenderHook } from './helpers/testHarness';
import { useTabManager } from '../hooks/useTabManager';

describe('useTabManager — molview tab title update', () => {
    it('updateMolViewTabTitle rewrites only the matching molview tab', () => {
        const h = makeRenderHook(() => useTabManager());

        act(() => h.result.addMolViewTab('Old:0', 10));
        act(() => h.result.addMolViewTab('Keep:0', 20));

        act(() => h.result.updateMolViewTabTitle(10, 'New:0'));

        expect(h.result.tabs.find((t) => t.viewId === 10)?.title).toBe('New:0');
        expect(h.result.tabs.find((t) => t.viewId === 20)?.title).toBe('Keep:0');
        h.unmount();
    });

    it('updateMolViewTabTitle is a no-op when the title is unchanged (stable refs)', () => {
        const h = makeRenderHook(() => useTabManager());

        act(() => h.result.addMolViewTab('Same:0', 10));
        const before = h.result.tabs;

        act(() => h.result.updateMolViewTabTitle(10, 'Same:0'));

        // Same array identity proves no state churn for an unchanged title.
        expect(h.result.tabs).toBe(before);
        h.unmount();
    });

    it('updateMolViewTabTitle ignores unknown view ids', () => {
        const h = makeRenderHook(() => useTabManager());

        act(() => h.result.addMolViewTab('Old:0', 10));

        act(() => h.result.updateMolViewTabTitle(999, 'Nope'));

        expect(h.result.tabs.find((t) => t.viewId === 10)?.title).toBe('Old:0');
        h.unmount();
    });
});
