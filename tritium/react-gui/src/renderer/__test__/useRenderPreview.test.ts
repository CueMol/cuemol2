/**
 * @file __test__/useRenderPreview.test.ts
 * @description Contract tests for the render preview pane state: showResult
 * stores the single latest result and opens the pane (persisting the flag)
 * without touching tabs; closePreview hides and persists; the open flag is
 * restored from the persisted layout on first load.
 */

import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { makeRenderHook } from './helpers/testHarness';
import { useRenderPreview } from '../hooks/useRenderPreview';
import type { RenderResult } from '../data/renderResult';

const fixtureResult = (id: string): RenderResult => ({
    id,
    imageDataUrl: '',
    width: 1200,
    height: 900,
    elapsedSec: 5.2,
    sourceSceneId: 1,
    sourceSceneName: 'Scene1',
    sourceViewId: 7,
    settingsSnapshot: { backend: 'povray', commonProps: [], backendProps: [] },
});

describe('useRenderPreview', () => {
    it('showResult stores the result, opens the pane and persists open=true', () => {
        const persist = vi.fn();
        const h = makeRenderHook(() =>
            useRenderPreview({ layout: {}, loaded: true, persistRenderPreviewOpen: persist }),
        );

        expect(h.result.previewOpen).toBe(false);
        expect(h.result.previewResult).toBeNull();

        act(() => h.result.showResult(fixtureResult('rr-1')));

        expect(h.result.previewOpen).toBe(true);
        expect(h.result.previewResult?.id).toBe('rr-1');
        expect(persist).toHaveBeenCalledWith(true);
        h.unmount();
    });

    it('a second showResult overwrites the single slot', () => {
        const h = makeRenderHook(() =>
            useRenderPreview({ layout: {}, loaded: true, persistRenderPreviewOpen: vi.fn() }),
        );

        act(() => h.result.showResult(fixtureResult('rr-1')));
        act(() => h.result.showResult(fixtureResult('rr-2')));

        expect(h.result.previewResult?.id).toBe('rr-2');
        h.unmount();
    });

    it('closePreview hides the pane and persists open=false, keeping the result', () => {
        const persist = vi.fn();
        const h = makeRenderHook(() =>
            useRenderPreview({ layout: {}, loaded: true, persistRenderPreviewOpen: persist }),
        );

        act(() => h.result.showResult(fixtureResult('rr-1')));
        act(() => h.result.closePreview());

        expect(h.result.previewOpen).toBe(false);
        expect(h.result.previewResult?.id).toBe('rr-1');
        expect(persist).toHaveBeenLastCalledWith(false);
        h.unmount();
    });

    it('restores the open flag from the persisted layout once loaded', () => {
        const h = makeRenderHook(() =>
            useRenderPreview({
                layout: { renderPreviewOpen: true },
                loaded: true,
                persistRenderPreviewOpen: vi.fn(),
            }),
        );

        expect(h.result.previewOpen).toBe(true);
        // No result yet -- App gates pane visibility on previewResult !== null.
        expect(h.result.previewResult).toBeNull();
        h.unmount();
    });
});
