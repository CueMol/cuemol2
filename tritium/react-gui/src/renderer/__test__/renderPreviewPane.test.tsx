/**
 * @file __test__/renderPreviewPane.test.tsx
 * @description Contract tests for the docked render preview pane: it renders
 * a header (title + close button) above the result viewer, forwards the
 * close click to onClose, and renders nothing when there is no result.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { mountTree } from './helpers/testHarness';
import { RenderPreviewPane } from '../components/panes/RenderPreviewPane';
import type { RenderResult } from '../data/renderResult';

void React;

const fixtureResult = (id: string): RenderResult => ({
    id,
    imageDataUrl: 'data:,',
    width: 1200,
    height: 900,
    elapsedSec: 5.2,
    sourceSceneId: 1,
    sourceSceneName: 'Scene1',
    sourceViewId: 7,
    settingsSnapshot: { backend: 'povray', commonProps: [], backendProps: [] },
});

const noop = () => undefined;

describe('RenderPreviewPane', () => {
    it('renders header and result viewer for a result', () => {
        const t = mountTree(
            <RenderPreviewPane
                result={fixtureResult('rr-1')}
                onClose={noop}
                onReRender={noop}
                onShowSourceScene={noop}
                onOpenSettings={noop}
            />,
        );

        expect(t.container.querySelector('.render-preview-header-name')?.textContent).toBe(
            'Render Preview',
        );
        // The body reuses RenderResultPane / RenderImageViewer.
        expect(t.container.querySelector('.render-result-pane')).not.toBeNull();
        t.unmount();
    });

    it('close button invokes onClose', () => {
        const onClose = vi.fn();
        const t = mountTree(
            <RenderPreviewPane
                result={fixtureResult('rr-1')}
                onClose={onClose}
                onReRender={noop}
                onShowSourceScene={noop}
                onOpenSettings={noop}
            />,
        );

        const btn = t.container.querySelector('.render-preview-close-btn');
        expect(btn).not.toBeNull();
        act(() => {
            btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onClose).toHaveBeenCalledTimes(1);
        t.unmount();
    });

    it('renders nothing when result is null', () => {
        const t = mountTree(
            <RenderPreviewPane
                result={null}
                onClose={noop}
                onReRender={noop}
                onShowSourceScene={noop}
                onOpenSettings={noop}
            />,
        );

        expect(t.container.querySelector('.render-preview')).toBeNull();
        t.unmount();
    });
});
