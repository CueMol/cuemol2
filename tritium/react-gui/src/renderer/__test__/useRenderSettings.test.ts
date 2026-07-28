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

    it('applies a movie video-resolution preset (exact pixels, no DPI change)', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.setMode('movie'));
        act(() => h.result.applyPreset('HD1080 (1920×1080)'));
        expect(valueOf(h.result.commonProps, 'width')).toBe(1920);
        expect(valueOf(h.result.commonProps, 'height')).toBe(1080);
        expect(valueOf(h.result.commonProps, 'unit')).toBe('px');
        h.unmount();
    });

    it('movie mode starts on the QVGA preset', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.applyPreset('600×600 (300dpi)'));
        // Switching to movie replaces the still preset with QVGA and its size.
        act(() => h.result.setMode('movie'));
        expect(h.result.preset).toBe('QVGA (320×240)');
        expect(valueOf(h.result.commonProps, 'width')).toBe(320);
        expect(valueOf(h.result.commonProps, 'height')).toBe(240);
        h.unmount();
    });

    it('still mode returns to its default preset (1200x1200)', () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.setMode('movie'));
        act(() => h.result.setMode('still'));
        expect(h.result.preset).toBe('1200×1200 (600dpi)');
        expect(valueOf(h.result.commonProps, 'width')).toBe(1200);
        expect(valueOf(h.result.commonProps, 'height')).toBe(1200);
        h.unmount();
    });

    // --- Size-unit conversion (UXP render-pov-dlg onImgSzUnitSel parity) ---

    it('changing the unit reprojects width/height via DPI and switches the control to real', () => {
        const h = makeRenderHook(() => useRenderSettings());
        // defaults: 1200 x 1200 px at 600 DPI.
        act(() => h.result.handleChange('unit', 'in'));
        expect(valueOf(h.result.commonProps, 'unit')).toBe('in');
        // 1200px / 600dpi = 2 in for both.
        expect(valueOf(h.result.commonProps, 'width')).toBe(2);
        expect(valueOf(h.result.commonProps, 'height')).toBe(2);
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
        expect(valueOf(h.result.commonProps, 'height')).toBe(1200);
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

// Quality axes (umbreon). The axes are independent -- image quality, shadows
// and the depth-cue method's own ladder are separate dropdowns -- and each one
// falls back to Custom on its own as soon as a prop it owns is edited by hand.
describe('useRenderSettings quality axes', () => {
    /** Hook on the umbreon backend (the only one with quality axes). */
    const umbreonHook = () => {
        const h = makeRenderHook(() => useRenderSettings());
        act(() => h.result.setBackend('umbreon'));
        return h;
    };

    it('starts on the default method with every axis at its default step', () => {
        const h = umbreonHook();
        expect(h.result.lighting).toBe('gi');
        expect(h.result.qualitySteps).toEqual({
            aa: 'high',
            ao: 'medium',
            gi: 'medium',
            shadows: 'off',
        });
        // Those defaults are already written into the props.
        expect(valueOf(h.result.backendProps, 'useGI')).toBe(true);
        expect(valueOf(h.result.backendProps, 'supersample')).toBe(3);
        expect(valueOf(h.result.backendProps, 'giSamples')).toBe(32);
        expect(valueOf(h.result.backendProps, 'shadows')).toBe(false);
        h.unmount();
    });

    it('setLighting switches the method exclusively (AO on turns GI off)', () => {
        const h = umbreonHook();
        act(() => h.result.setLighting('ao'));
        expect(h.result.lighting).toBe('ao');
        expect(valueOf(h.result.backendProps, 'aoEnabled')).toBe(true);
        expect(valueOf(h.result.backendProps, 'useGI')).toBe(false);

        act(() => h.result.setLighting('none'));
        expect(h.result.lighting).toBe('none');
        expect(valueOf(h.result.backendProps, 'aoEnabled')).toBe(false);
        expect(valueOf(h.result.backendProps, 'useGI')).toBe(false);
        h.unmount();
    });

    it('switching method applies that method\'s ladder at its selected step', () => {
        const h = umbreonHook();
        act(() => h.result.setQualityStep('ao', 'high'));
        act(() => h.result.setLighting('ao'));
        // The AO axis kept its step and its values are now in the props.
        expect(h.result.qualitySteps.ao).toBe('high');
        expect(valueOf(h.result.backendProps, 'aoSamples')).toBe(256);
        expect(valueOf(h.result.backendProps, 'aoGather')).toBe('Per shading hit');
        h.unmount();
    });

    it('the supersampling axis sets the grid factor only', () => {
        const h = umbreonHook();
        act(() => h.result.setQualityStep('aa', 'low'));
        expect(valueOf(h.result.backendProps, 'supersample')).toBe(1);
        act(() => h.result.setQualityStep('aa', 'ultra'));
        expect(valueOf(h.result.backendProps, 'supersample')).toBe(4);
        // Adaptive AA is not offered (unsupported alongside GI), so no
        // antialiasing-mode prop exists to be written.
        expect(valueOf(h.result.backendProps, 'aaMode')).toBeUndefined();
        h.unmount();
    });

    it('applyViewCamera defaults the projection to the target view', () => {
        const h = umbreonHook();
        act(() => h.result.applyViewCamera({ perspective: false }));
        expect(valueOf(h.result.commonProps, 'projection')).toBe('orthographic');
        act(() => h.result.applyViewCamera({ perspective: true }));
        expect(valueOf(h.result.commonProps, 'projection')).toBe('perspective');
        h.unmount();
    });

    it('the shadow axis is independent of the depth-cue method', () => {
        const h = umbreonHook();
        act(() => h.result.setQualityStep('shadows', 'soft'));
        expect(valueOf(h.result.backendProps, 'shadows')).toBe(true);
        expect(valueOf(h.result.backendProps, 'shadowSamples')).toBe(16);
        expect(valueOf(h.result.backendProps, 'lightRadius')).toBe(3);
        // Switching the method leaves it alone.
        act(() => h.result.setLighting('ao'));
        expect(h.result.qualitySteps.shadows).toBe('soft');
        expect(valueOf(h.result.backendProps, 'shadowSamples')).toBe(16);
        h.unmount();
    });

    it('the GI ladder follows the umbreon guide steps', () => {
        const h = umbreonHook();
        act(() => h.result.setQualityStep('gi', 'low'));
        expect(valueOf(h.result.backendProps, 'giSamples')).toBe(8);
        act(() => h.result.setQualityStep('gi', 'reference'));
        expect(valueOf(h.result.backendProps, 'giSamples')).toBe(256);
        h.unmount();
    });

    it('editing a prop drops only the axis that owns it to Custom', () => {
        const h = umbreonHook();
        act(() => h.result.handleChange('supersample', 6));
        expect(h.result.qualitySteps.aa).toBe('custom');
        // The other axes still describe their own props correctly.
        expect(h.result.qualitySteps.gi).toBe('medium');
        expect(h.result.qualitySteps.shadows).toBe('off');
        h.unmount();
    });

    it('editing a look setting no axis owns keeps every axis', () => {
        const h = umbreonHook();
        // GI intensity is a look knob, deliberately outside the quality ladders.
        act(() => h.result.handleChange('giIntensity', 1.5));
        expect(h.result.qualitySteps.gi).toBe('medium');
        expect(h.result.qualitySteps.aa).toBe('high');
        h.unmount();
    });

    it('switching backend resets the axes (POV-Ray declares none)', () => {
        const h = umbreonHook();
        act(() => h.result.setQualityStep('aa', 'low'));
        act(() => h.result.setBackend('povray'));
        expect(h.result.qualitySteps).toEqual({});
        h.unmount();
    });
});
