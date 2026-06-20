/**
 * @file __test__/useTabManager.test.ts
 * @description Contract tests for render-result tab creation: a completed
 * render opens at most one tab per source scene -- re-rendering the same
 * scene overwrites that tab rather than spawning a new one.
 */

import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { makeRenderHook } from './helpers/testHarness';
import { useTabManager } from '../hooks/useTabManager';
import type { RenderResult } from '../data/renderResult';

const fixtureResult = (id: string, sourceSceneId = 1): RenderResult => ({
    id,
    imageDataUrl: '',
    width: 1200,
    height: 900,
    elapsedSec: 5.2,
    sourceSceneId,
    sourceSceneName: `Scene${sourceSceneId}`,
    sourceViewId: 7,
    settingsSnapshot: { backend: 'povray', commonProps: [], backendProps: [] },
});

describe('useTabManager — render result tabs', () => {
    it('addRenderResultTab opens a scene-keyed renderResult tab and activates it', () => {
        const h = makeRenderHook(() => useTabManager());

        act(() => h.result.addRenderResultTab(fixtureResult('rr-1', 1)));

        const tab = h.result.tabs.find((t) => t.id === 'render-result-scene-1');
        expect(tab?.type).toBe('renderResult');
        expect(tab?.renderResult?.id).toBe('rr-1');
        // Title follows the `Scene -- W×H (Ns)` convention.
        expect(tab?.title).toContain('Scene1');
        expect(tab?.title).toContain('1200×900');
        expect(h.result.activeTab).toBe('render-result-scene-1');
        h.unmount();
    });

    it('re-rendering the same scene overwrites the existing result tab', () => {
        const h = makeRenderHook(() => useTabManager());

        act(() => h.result.addRenderResultTab(fixtureResult('rr-1', 1)));
        act(() => h.result.addRenderResultTab(fixtureResult('rr-2', 1)));

        const rrTabs = h.result.tabs.filter((t) => t.type === 'renderResult');
        expect(rrTabs.length).toBe(1);
        expect(rrTabs[0].renderResult?.id).toBe('rr-2');
        h.unmount();
    });

    it('different source scenes get separate result tabs', () => {
        const h = makeRenderHook(() => useTabManager());

        act(() => h.result.addRenderResultTab(fixtureResult('rr-a', 1)));
        act(() => h.result.addRenderResultTab(fixtureResult('rr-b', 2)));

        expect(h.result.tabs.filter((t) => t.type === 'renderResult').length).toBe(2);
        h.unmount();
    });
});

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
