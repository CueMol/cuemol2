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

const propOf = (props: { key: string; type?: unknown }[], key: string) =>
    props.find((p) => p.key === key);

describe('useRenderSettings', () => {
    it('starts on the default backend with common + backend props', () => {
        const h = makeRenderHook(() => useRenderSettings());
        expect(h.result.backend).toBe('povray');
        expect(valueOf(h.result.commonProps, 'width')).toBe(1200);
        expect(valueOf(h.result.backendProps, 'shadow')).toBe(false);
        h.unmount();
    });

    it('defaults to umbreon when the build supports it', () => {
        const h = makeRenderHook(() => useRenderSettings({ umbreonAvailable: true }));
        expect(h.result.backend).toBe('umbreon');
        // Backend props swapped to umbreon's (POV-Ray-only "shadow" is gone).
        expect(valueOf(h.result.backendProps, 'shadow')).toBeUndefined();
        expect(valueOf(h.result.backendProps, 'aoEnabled')).toBe(false);
        h.unmount();
    });

    it('a manual backend pick wins over a later umbreon auto-default', () => {
        let avail = false;
        const h = makeRenderHook(() => useRenderSettings({ umbreonAvailable: avail }));
        // User explicitly stays on POV-Ray before umbreon availability is known.
        act(() => h.result.setBackend('povray'));
        // Umbreon becomes available afterwards -> must NOT override the manual pick.
        avail = true;
        h.rerender();
        expect(h.result.backend).toBe('povray');
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
                mode: 'still',
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

    // --- Size-unit conversion (UXP render-pov-dlg onImgSzUnitSel parity) ---

    it('changing the unit reprojects width/height via DPI and switches the control to real', () => {
        const h = makeRenderHook(() => useRenderSettings());
        // defaults: 1200 x 900 px at 600 DPI.
        act(() => h.result.handleChange('unit', 'in'));
        expect(valueOf(h.result.commonProps, 'unit')).toBe('in');
        // 1200px / 600dpi = 2 in; 900 / 600 = 1.5 in.
        expect(valueOf(h.result.commonProps, 'width')).toBe(2);
        expect(valueOf(h.result.commonProps, 'height')).toBe(1.5);
        // The field becomes a fractional control, not an integer pixel one,
        // and carries the new unit as its in-field suffix.
        const width = propOf(h.result.commonProps, 'width') as { type: string; unit?: string; decimals?: number };
        expect(width.type).toBe('real');
        expect(width.unit).toBe('in');
        expect(width.decimals).toBe(3);
        h.unmount();
    });

    it('switching the unit back to px restores the original pixel size and integer control', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.handleChange('unit', 'in'));
        act(() => h.result.handleChange('unit', 'px'));
        expect(valueOf(h.result.commonProps, 'width')).toBe(1200);
        expect(valueOf(h.result.commonProps, 'height')).toBe(900);
        const width = propOf(h.result.commonProps, 'width') as { type: string; unit?: string };
        expect(width.type).toBe('integer');
        expect(width.unit).toBe('px');
        h.unmount();
    });

    it('unit conversion uses the current DPI', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.handleChange('dpi', 300));
        act(() => h.result.handleChange('unit', 'in'));
        // 1200px / 300dpi = 4 in.
        expect(valueOf(h.result.commonProps, 'width')).toBe(4);
        h.unmount();
    });

    it('applyPreset resets the unit to px (presets are pixel sizes)', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.handleChange('unit', 'in'));
        act(() => h.result.applyPreset('600×600 (300dpi)'));
        expect(valueOf(h.result.commonProps, 'unit')).toBe('px');
        expect(valueOf(h.result.commonProps, 'width')).toBe(600);
        expect(propOf(h.result.commonProps, 'width')?.type).toBe('integer');
        h.unmount();
    });
});
