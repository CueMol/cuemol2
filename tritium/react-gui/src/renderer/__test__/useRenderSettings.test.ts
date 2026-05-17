/**
 * @file __test__/useRenderSettings.test.ts
 * @description Contract tests for the render-settings editing hook: value
 * edits land on the right list, and switching backend keeps the common
 * settings while resetting the backend-specific ones.
 */

import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { makeRenderHook } from './helpers/testHarness';
import { useRenderSettings } from '../hooks/useRenderSettings';

const valueOf = (props: { key: string; value: unknown }[], key: string) =>
    props.find((p) => p.key === key)?.value;

describe('useRenderSettings', () => {
    it('starts on the default backend with common + backend props', () => {
        const h = makeRenderHook(() => useRenderSettings());
        expect(h.result.backend).toBe('povray');
        expect(valueOf(h.result.commonProps, 'width')).toBe(1200);
        expect(valueOf(h.result.backendProps, 'shadow')).toBe(false);
        h.unmount();
    });

    it('handleChange updates a common setting value', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.handleChange('width', 800));
        expect(valueOf(h.result.commonProps, 'width')).toBe(800);
        h.unmount();
    });

    it('handleChange updates a backend-specific setting value', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.handleChange('shadow', true));
        expect(valueOf(h.result.backendProps, 'shadow')).toBe(true);
        h.unmount();
    });

    it('setBackend keeps common settings but resets backend-specific ones', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.handleChange('width', 800));
        act(() => h.result.handleChange('shadow', true));

        act(() => h.result.setBackend('povray'));

        // Common edit survives; backend-specific edit is reset to default.
        expect(valueOf(h.result.commonProps, 'width')).toBe(800);
        expect(valueOf(h.result.backendProps, 'shadow')).toBe(false);
        h.unmount();
    });

    it('getSnapshot returns the current settings', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.handleChange('width', 333));
        const snap = h.result.getSnapshot();
        expect(snap.backend).toBe('povray');
        expect(valueOf(snap.commonProps, 'width')).toBe(333);
        h.unmount();
    });

    it('restore loads settings from a snapshot', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() =>
            h.result.restore({
                backend: 'povray',
                commonProps: [
                    { key: 'width', label: 'Width', type: 'integer', value: 640, group: 'Image' },
                ],
                backendProps: [
                    { key: 'shadow', label: 'Shadow', type: 'boolean', value: true, group: 'POV-Ray' },
                ],
            }),
        );
        expect(valueOf(h.result.commonProps, 'width')).toBe(640);
        expect(valueOf(h.result.backendProps, 'shadow')).toBe(true);
        h.unmount();
    });

    it('applyPreset sets the preset label, image size and dpi', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.applyPreset('600×600 (300dpi)'));
        expect(h.result.preset).toBe('600×600 (300dpi)');
        expect(valueOf(h.result.commonProps, 'width')).toBe(600);
        expect(valueOf(h.result.commonProps, 'height')).toBe(600);
        expect(valueOf(h.result.commonProps, 'dpi')).toBe(300);
        h.unmount();
    });

    it('the "Current view" preset uses the supplied dynamic size', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.applyPreset('Current view', { width: 1024, height: 768 }));
        expect(h.result.preset).toBe('Current view');
        expect(valueOf(h.result.commonProps, 'width')).toBe(1024);
        expect(valueOf(h.result.commonProps, 'height')).toBe(768);
        h.unmount();
    });

    it('a manual size edit resets the preset to Custom', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.applyPreset('600×600 (300dpi)'));
        act(() => h.result.handleChange('width', 1024));
        expect(h.result.preset).toBe('Custom');
        h.unmount();
    });
});
