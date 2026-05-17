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
});
