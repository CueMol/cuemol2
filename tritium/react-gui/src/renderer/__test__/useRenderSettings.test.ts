/**
 * @file __test__/useRenderSettings.test.ts
 * @description Contract tests for the render-settings editing hook: value
 * edits land on the right list, and switching backend keeps the common
 * settings while resetting the backend-specific ones.
 */

import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { makeRenderHook } from '@renderer/__test__/helpers/testHarness';
import { useRenderSettings } from '@renderer/features/render/useRenderSettings';
import { parseHatchSpec } from '@renderer/data/hatchSpec';
import type { RenderBackendId } from '@renderer/data/renderSettings';
import type { RenderSettingsValues } from '@renderer/worker/shared/renderSettingsValues';
import {
    fixtureBackendProps,
    fixtureLoaded,
} from '@renderer/__test__/fixtures/renderSettingsValues';

const valueOf = (props: { key: string; value: unknown }[], key: string) =>
    props.find((p) => p.key === key)?.value;

const propOf = (props: { key: string; type?: unknown }[], key: string) =>
    props.find((p) => p.key === key);

/**
 * The hook as the window uses it: mounted, then loaded with what the target
 * scene holds (here the fixture defaults, optionally overridden).
 */
const mountSettings = (overrides: RenderSettingsValues = {}, umbreonAvailable = false) => {
    const h = makeRenderHook(() => useRenderSettings());
    act(() => h.result.loadFromScene(fixtureLoaded(overrides, umbreonAvailable)));
    return h;
};

/** The user's backend pick, with that backend's rows as the scene holds them. */
const pickBackend = (h: ReturnType<typeof mountSettings>, id: RenderBackendId) =>
    act(() => h.result.setBackend(id, fixtureBackendProps(id)));

describe('useRenderSettings', () => {
    it('starts on the default backend with common + backend props', () => {
        const h = mountSettings();
        expect(h.result.backend).toBe('povray');
        expect(valueOf(h.result.commonProps, 'width')).toBe(1200);
        expect(valueOf(h.result.backendProps, 'shadow')).toBe(false);
        h.unmount();
    });

    it('defaults to umbreon when the build supports it', () => {
        const h = mountSettings({}, true);
        expect(h.result.backend).toBe('umbreon');
        // Backend props swapped to umbreon's (POV-Ray-only "shadow" is gone).
        expect(valueOf(h.result.backendProps, 'shadow')).toBeUndefined();
        expect(valueOf(h.result.backendProps, 'aoEnabled')).toBe(false);
        // A backend nobody chose is not stored as chosen.
        expect(h.result.backendExplicit).toBe(false);
        h.unmount();
    });

    it('a backend the scene names is kept and counts as chosen', () => {
        const h = mountSettings({ backend: 'povray' }, true);
        expect(h.result.backend).toBe('povray');
        expect(h.result.backendExplicit).toBe(true);
        h.unmount();
    });

    it('handleChange updates a common setting value', () => {
        const h = mountSettings();
        act(() => h.result.handleChange('width', 800));
        expect(valueOf(h.result.commonProps, 'width')).toBe(800);
        h.unmount();
    });

    it('handleChange updates a backend-specific setting value', () => {
        const h = mountSettings();
        act(() => h.result.handleChange('shadow', true));
        expect(valueOf(h.result.backendProps, 'shadow')).toBe(true);
        h.unmount();
    });

    it('setBackend keeps common settings but resets backend-specific ones', () => {
        const h = mountSettings();
        act(() => h.result.handleChange('width', 800));
        act(() => h.result.handleChange('shadow', true));

        pickBackend(h, 'povray');

        // Common edit survives; backend-specific edit is reset to default.
        expect(valueOf(h.result.commonProps, 'width')).toBe(800);
        expect(valueOf(h.result.backendProps, 'shadow')).toBe(false);
        h.unmount();
    });

    it('getSnapshot returns the current settings', () => {
        const h = mountSettings();
        act(() => h.result.handleChange('width', 333));
        const snap = h.result.getSnapshot();
        expect(snap.backend).toBe('povray');
        expect(valueOf(snap.commonProps, 'width')).toBe(333);
        h.unmount();
    });

    it('restore loads settings from a snapshot', () => {
        const h = mountSettings();
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
        const h = mountSettings();
        act(() => h.result.applyPreset('600×600 (300dpi)'));
        expect(h.result.preset).toBe('600×600 (300dpi)');
        expect(valueOf(h.result.commonProps, 'width')).toBe(600);
        expect(valueOf(h.result.commonProps, 'height')).toBe(600);
        expect(valueOf(h.result.commonProps, 'dpi')).toBe(300);
        h.unmount();
    });

    it('the "Current view" preset uses the supplied dynamic size', () => {
        const h = mountSettings();
        act(() => h.result.applyPreset('Current view', { width: 1024, height: 768 }));
        expect(h.result.preset).toBe('Current view');
        expect(valueOf(h.result.commonProps, 'width')).toBe(1024);
        expect(valueOf(h.result.commonProps, 'height')).toBe(768);
        h.unmount();
    });

    it('a manual size edit resets the preset to Custom', () => {
        const h = mountSettings();
        act(() => h.result.applyPreset('600×600 (300dpi)'));
        act(() => h.result.handleChange('width', 1024));
        expect(h.result.preset).toBe('Custom');
        h.unmount();
    });

    it('applies a movie video-resolution preset (exact pixels, no DPI change)', () => {
        const h = mountSettings();
        act(() => h.result.setMode('movie'));
        act(() => h.result.applyPreset('HD1080 (1920×1080)'));
        expect(valueOf(h.result.commonProps, 'width')).toBe(1920);
        expect(valueOf(h.result.commonProps, 'height')).toBe(1080);
        expect(valueOf(h.result.commonProps, 'unit')).toBe('px');
        h.unmount();
    });

    it('movie mode starts on the QVGA preset', () => {
        const h = mountSettings();
        act(() => h.result.applyPreset('600×600 (300dpi)'));
        // Switching to movie replaces the still preset with QVGA and its size.
        act(() => h.result.setMode('movie'));
        expect(h.result.preset).toBe('QVGA (320×240)');
        expect(valueOf(h.result.commonProps, 'width')).toBe(320);
        expect(valueOf(h.result.commonProps, 'height')).toBe(240);
        h.unmount();
    });

    it('still mode returns to its default preset (1200x1200)', () => {
        const h = mountSettings();
        act(() => h.result.setMode('movie'));
        act(() => h.result.setMode('still'));
        expect(h.result.preset).toBe('1200×1200 (600dpi)');
        expect(valueOf(h.result.commonProps, 'width')).toBe(1200);
        expect(valueOf(h.result.commonProps, 'height')).toBe(1200);
        h.unmount();
    });

    // --- Size-unit conversion (UXP render-pov-dlg onImgSzUnitSel parity) ---

    it('changing the unit reprojects width/height via DPI and switches the control to real', () => {
        const h = mountSettings();
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
        const h = mountSettings();
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
        const h = mountSettings();
        act(() => h.result.handleChange('dpi', 300));
        act(() => h.result.handleChange('unit', 'in'));
        // 1200px / 300dpi = 4 in.
        expect(valueOf(h.result.commonProps, 'width')).toBe(4);
        h.unmount();
    });

    it('applyPreset resets the unit to px (presets are pixel sizes)', () => {
        const h = mountSettings();
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
        const h = mountSettings();
        pickBackend(h, 'umbreon');
        return h;
    };

    it('starts on the default method with every axis at its default step', () => {
        const h = umbreonHook();
        expect(h.result.lighting).toBe('gi');
        expect(h.result.qualitySteps).toEqual({
            aa: 'high',
            ao: 'medium',
            giLighting: '4',
            shadows: 'off',
        });
        // Those defaults are already written into the props.
        expect(valueOf(h.result.backendProps, 'useGI')).toBe(true);
        expect(valueOf(h.result.backendProps, 'supersample')).toBe(3);
        // GI samples is a plain dropdown (no ladder), so its own default holds.
        expect(valueOf(h.result.backendProps, 'giSamples')).toBe('32');
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

    it('editing a prop off the ladder drops only that axis to Custom', () => {
        const h = umbreonHook();
        act(() => h.result.handleChange('supersample', 6));
        expect(h.result.qualitySteps.aa).toBe('custom');
        // The other axes still describe their own props correctly.
        expect(h.result.qualitySteps.giLighting).toBe('4');
        expect(h.result.qualitySteps.shadows).toBe('off');
        h.unmount();
    });

    it('editing a prop back onto a step reports that step again', () => {
        const h = umbreonHook();
        act(() => h.result.handleChange('supersample', 6));
        expect(h.result.qualitySteps.aa).toBe('custom');
        // The step is read back from the values, so landing on a ladder value
        // by hand is indistinguishable from picking it in the dropdown.
        act(() => h.result.handleChange('supersample', 4));
        expect(h.result.qualitySteps.aa).toBe('ultra');
        h.unmount();
    });

    it('switching the lighting method leaves the shared axes alone', () => {
        const h = umbreonHook();
        act(() => h.result.setQualityStep('shadows', 'soft'));
        act(() => h.result.setQualityStep('aa', 'ultra'));

        act(() => h.result.setLighting('ao'));
        // Image quality and shadows have nothing to do with the depth cue, so
        // they keep both their values and their step names.
        expect(h.result.qualitySteps.aa).toBe('ultra');
        expect(h.result.qualitySteps.shadows).toBe('soft');
        expect(valueOf(h.result.backendProps, 'supersample')).toBe(4);
        expect(valueOf(h.result.backendProps, 'shadowSamples')).toBe(16);

        act(() => h.result.setLighting('none'));
        expect(h.result.qualitySteps.aa).toBe('ultra');
        expect(h.result.qualitySteps.shadows).toBe('soft');
        h.unmount();
    });

    it('restoring a snapshot reports the steps its values match', () => {
        const h = umbreonHook();
        act(() => h.result.setQualityStep('aa', 'low'));
        act(() => h.result.setQualityStep('giLighting', '3'));
        const snapshot = h.result.getSnapshot();

        act(() => h.result.setQualityStep('aa', 'ultra'));
        act(() => h.result.restore(snapshot));
        // Re-rendering a past result must not leave every dropdown on Custom
        // over values that plainly match a step.
        expect(h.result.qualitySteps.aa).toBe('low');
        expect(h.result.qualitySteps.giLighting).toBe('3');
        h.unmount();
    });

    it('editing a look setting no axis owns keeps every axis', () => {
        const h = umbreonHook();
        // The GI ground color is a look knob outside every ladder.
        act(() => h.result.handleChange('giGroundColor', '#444444'));
        expect(h.result.qualitySteps.giLighting).toBe('4');
        expect(h.result.qualitySteps.aa).toBe('high');
        h.unmount();
    });

    it('the GI lighting axis trades headlight for key light and gathered ambient', () => {
        const h = umbreonHook();
        // The default step is the top one; its values are already in the props.
        expect(valueOf(h.result.backendProps, 'lightIntensity')).toBe(1.2);
        expect(valueOf(h.result.backendProps, 'flashFraction')).toBe(0.05);
        expect(valueOf(h.result.backendProps, 'ambientFraction')).toBe(0.4);
        act(() => h.result.setQualityStep('giLighting', '2'));
        expect(h.result.qualitySteps.giLighting).toBe('2');
        expect(valueOf(h.result.backendProps, 'lightIntensity')).toBe(1.38);
        expect(valueOf(h.result.backendProps, 'flashFraction')).toBe(0.32);
        expect(valueOf(h.result.backendProps, 'ambientFraction')).toBe(0.3);
        // A hand edit of an owned prop drops the axis to Custom.
        act(() => h.result.handleChange('lightIntensity', 1.3));
        expect(h.result.qualitySteps.giLighting).toBe('custom');
        h.unmount();
    });

    it('picking a direct method writes the Lights defaults back', () => {
        const h = umbreonHook();
        expect(h.result.qualitySteps.giLighting).toBe('4');
        // The Lights group is shared, so without this a GI step with almost
        // no headlight would carry over into the raytrace.
        act(() => h.result.setLighting('none'));
        expect(valueOf(h.result.backendProps, 'lightIntensity')).toBe(1.55);
        expect(valueOf(h.result.backendProps, 'flashFraction')).toBe(0.6);
        // The step is derived from those shared values, so leaving GI resets
        // its lighting to step 0 (the defaults equal it, ambient included);
        // coming back starts from the raytrace match rather than Custom.
        expect(h.result.qualitySteps.giLighting).toBe('0');
        act(() => h.result.setLighting('gi'));
        expect(h.result.qualitySteps.giLighting).toBe('0');
        expect(valueOf(h.result.backendProps, 'ambientFraction')).toBe(0.16);
        h.unmount();
    });

    it('switching backend resets the axes (POV-Ray declares none)', () => {
        const h = umbreonHook();
        act(() => h.result.setQualityStep('aa', 'low'));
        pickBackend(h, 'povray');
        expect(h.result.qualitySteps).toEqual({});
        h.unmount();
    });
});

// The NPR backend restricts the same machinery: hatch ink mode discards the
// shaded color (umbreon force-disables GI there), so it offers raytracing and
// AO only and starts on plain raytracing.
describe('useRenderSettings NPR backend', () => {
    const nprHook = () => {
        const h = mountSettings();
        pickBackend(h, 'umbreon_npr');
        return h;
    };

    it('starts on raytracing with no GI axis', () => {
        const h = nprHook();
        expect(h.result.lighting).toBe('none');
        expect(h.result.qualitySteps).toEqual({
            aa: 'high',
            ao: 'medium',
            shadows: 'off',
        });
        expect(valueOf(h.result.backendProps, 'aoEnabled')).toBe(false);
        // The hatch pass is the point of the backend, so its style and the
        // density multiplier are present from the start.
        expect(valueOf(h.result.backendProps, 'hatchStyle')).toBe('richardson');
        expect(valueOf(h.result.backendProps, 'hatchDensity')).toBe(1.0);
        h.unmount();
    });

    it('setLighting("ao") is reported back (the enable patch reaches a real prop)', () => {
        const h = nprHook();
        act(() => h.result.setLighting('ao'));
        // A patch key with no matching PropDef would be dropped, leaving
        // `lighting` stuck on "none" -- this pins that it is not.
        expect(h.result.lighting).toBe('ao');
        expect(valueOf(h.result.backendProps, 'aoEnabled')).toBe(true);
        act(() => h.result.setLighting('none'));
        expect(h.result.lighting).toBe('none');
        h.unmount();
    });
});

// The NPR hatch look: the selected style is a template loaded from C++, the
// edited copy travels with the render only while it differs from it.
describe('useRenderSettings hatch look', () => {
    const TEMPLATE = 'layer: kind=line,width=1\nlayer: kind=dot\ntone: strength=1\nink: base=paper\n';
    const template = () => parseHatchSpec(TEMPLATE);

    const mountNpr = () => {
        const h = mountSettings({}, true);
        pickBackend(h, 'umbreon_npr');
        return h;
    };

    it('starts without a look and loads the selected style as template', () => {
        const h = mountNpr();
        expect(h.result.hatchStyle).toBe('richardson');
        expect(h.result.hatch.spec).toBeNull();
        expect(h.result.hatchLoaded).toBe(false);
        act(() => h.result.applyHatchTemplate('richardson', template()));
        expect(h.result.hatchLoaded).toBe(true);
        expect(h.result.hatchDirty).toBe(false);
        expect(h.result.hatch.spec?.layers).toHaveLength(2);
        // The editable copy is not the template object.
        expect(h.result.hatch.spec).not.toBe(h.result.hatch.template);
        h.unmount();
    });

    it('ignores a template for a style that is no longer selected', () => {
        const h = mountNpr();
        act(() => h.result.applyHatchTemplate('manga', template()));
        expect(h.result.hatch.spec).toBeNull();
        h.unmount();
    });

    it('edits mark the look dirty and travel in the snapshot; reset clears them', () => {
        const h = mountNpr();
        act(() => h.result.applyHatchTemplate('richardson', template()));
        expect(h.result.getSnapshot().hatch).toBeUndefined();
        const [first, second] = h.result.hatch.spec!.layers;
        act(() => h.result.updateHatchLayer(first.id, { width: 2 }));
        expect(h.result.hatchDirty).toBe(true);
        // Untouched layers keep their identity (memoised rows).
        expect(h.result.hatch.spec!.layers[1]).toBe(second);
        act(() => h.result.updateHatchTone({ strength: 2 }));
        const snap = h.result.getSnapshot();
        expect(snap.hatch?.layersSpec).toContain('width=2');
        expect(snap.hatch?.toneSpec).toContain('strength=2');
        act(() => h.result.resetHatchToTemplate());
        expect(h.result.hatchDirty).toBe(false);
        expect(h.result.getSnapshot().hatch).toBeUndefined();
        h.unmount();
    });

    it('adds, duplicates and removes layers', () => {
        const h = mountNpr();
        act(() => h.result.applyHatchTemplate('richardson', template()));
        act(() => h.result.addHatchLayer('stipple'));
        expect(h.result.hatch.spec!.layers.map((l) => l.kind)).toEqual(['line', 'dot', 'stipple']);
        const first = h.result.hatch.spec!.layers[0];
        act(() => h.result.duplicateHatchLayer(first.id));
        const layers = h.result.hatch.spec!.layers;
        expect(layers).toHaveLength(4);
        expect(layers[1].kind).toBe('line');
        expect(layers[1].id).not.toBe(first.id);
        act(() => h.result.removeHatchLayer(layers[1].id));
        expect(h.result.hatch.spec!.layers).toHaveLength(3);
        h.unmount();
    });

    it('a new style or backend drops the look', () => {
        const h = mountNpr();
        act(() => h.result.applyHatchTemplate('richardson', template()));
        act(() => h.result.handleChange('hatchStyle', 'manga'));
        expect(h.result.hatchStyle).toBe('manga');
        expect(h.result.hatch.spec).toBeNull();
        expect(h.result.hatchLoaded).toBe(false);
        act(() => h.result.applyHatchTemplate('manga', template()));
        pickBackend(h, 'umbreon');
        expect(h.result.hatch.spec).toBeNull();
        h.unmount();
    });

    it('restores an edited look from a snapshot and keeps it when the template arrives', () => {
        const h = mountNpr();
        act(() => h.result.applyHatchTemplate('richardson', template()));
        act(() => h.result.updateHatchTone({ strength: 3 }));
        const snap = h.result.getSnapshot();
        act(() => h.result.handleChange('hatchStyle', 'manga'));
        act(() => h.result.restore(snap));
        expect(h.result.hatchStyle).toBe('richardson');
        expect(h.result.hatchLoaded).toBe(false);
        expect(h.result.hatch.spec?.tone.strength).toBe(3);
        act(() => h.result.applyHatchTemplate('richardson', template()));
        expect(h.result.hatch.spec?.tone.strength).toBe(3);
        expect(h.result.hatchDirty).toBe(true);
        // A snapshot without a look restores none.
        act(() => h.result.restore({ ...snap, hatch: undefined }));
        expect(h.result.hatch.spec).toBeNull();
        h.unmount();
    });
});

describe('useRenderSettings scene sync', () => {
    it('counts user edits only, and shows the preset a loaded size equals', () => {
        const h = mountSettings({}, true);
        expect(h.result.userEditSeq).toBe(0);
        act(() => h.result.handleChange('width', 800));
        act(() => h.result.setLighting('ao'));
        expect(h.result.userEditSeq).toBe(2);
        expect(h.result.preset).toBe('Custom');

        // A load and the target view's camera default are not edits, and a
        // loaded size equal to a preset shows that preset, not Custom.
        act(() => h.result.loadFromScene(fixtureLoaded({ backend: 'umbreon' })));
        act(() => h.result.applyViewCamera({ perspective: false }));
        expect(h.result.userEditSeq).toBe(2);
        expect(valueOf(h.result.commonProps, 'width')).toBe(1200);
        expect(h.result.preset).toBe('1200\u00d71200 (600dpi)');
        h.unmount();
    });
});
