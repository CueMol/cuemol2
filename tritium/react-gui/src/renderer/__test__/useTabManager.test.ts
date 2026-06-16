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
