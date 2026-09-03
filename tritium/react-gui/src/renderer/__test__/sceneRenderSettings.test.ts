/**
 * @file __test__/sceneRenderSettings.test.ts
 * @description The scene's render-settings schema on the TS side: the
 * editor state survives a round trip through the stored values, and a value
 * the catalog cannot represent falls back to the C++ default with a warning
 * instead of failing the load.
 */

import { describe, it, expect, vi } from 'vitest';
import {
    SCENE_VALUE_TYPES,
    blockKey,
    snapshotFromRenderSettings,
    valuesFromSnapshot,
} from '@renderer/features/render/sceneRenderSettings';
import { RENDER_BACKEND_IDS } from '@renderer/data/renderBackends';
import type { PropDef } from '@renderer/data/rendererProperties';
import {
    RENDER_SETTINGS_DEFAULTS,
    fixtureValues,
} from '@renderer/__test__/fixtures/renderSettingsValues';

const valueOf = (props: PropDef[], key: string) => props.find((p) => p.key === key)?.value;
const defaults = RENDER_SETTINGS_DEFAULTS;

describe('sceneRenderSettings', () => {
    it('round-trips the stored values of every backend through the editor state', () => {
        for (const backend of RENDER_BACKEND_IDS) {
            const stored = fixtureValues({
                backend,
                width: 800,
                [blockKey(backend, 'lightIntensity')]: 0.9,
                ...(backend === 'umbreon_npr'
                    ? { [blockKey(backend, 'hatchLayersSpec')]: 'layer: kind=line\n' }
                    : {}),
            });
            const loaded = snapshotFromRenderSettings(stored, { defaults, umbreonAvailable: true, mode: 'strict' });
            expect(loaded.backend).toBe(backend);
            expect(loaded.backendExplicit).toBe(true);
            expect(valueOf(loaded.commonProps, 'width')).toBe(800);
            expect(valueOf(loaded.backendProps, 'lightIntensity')).toBe(0.9);
            expect(loaded.hatch?.layersSpec).toBe(backend === 'umbreon_npr' ? 'layer: kind=line\n' : undefined);

            // What goes back to the scene: the keys the editor shows, at the loaded values.
            const back = valuesFromSnapshot(loaded);
            const expected = Object.fromEntries(
                Object.entries(stored).filter(
                    ([k]) => k in SCENE_VALUE_TYPES && (!k.includes('.') || k.startsWith(`${backend}.`)),
                ),
            );
            expect(back).toEqual(expected);
        }
    });

    it('falls back to the C++ default on an invalid or missing value and reports it', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { [blockKey('umbreon', 'aoGather')]: _missing, ...rest } = fixtureValues({ backend: 'umbreon' });
        void _missing;
        const values = {
            ...rest,
            [blockKey('umbreon', 'denoise')]: 'Wavelet', // unknown option
            [blockKey('umbreon', 'supersample')]: 99,   // out of range
            [blockKey('umbreon', 'noSuchKey')]: 1,      // not shown by the editor: ignored
        };

        const loaded = snapshotFromRenderSettings(values, { defaults, umbreonAvailable: true });
        expect(valueOf(loaded.backendProps, 'denoise')).toBe('OIDN');
        expect(valueOf(loaded.backendProps, 'supersample')).toBe(3);
        expect(valueOf(loaded.backendProps, 'aoGather')).toBe('Per output pixel');
        expect(loaded.warnings.map((w) => w.split(':')[0]).sort()).toEqual([
            'umbreon.aoGather', 'umbreon.denoise', 'umbreon.supersample',
        ]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(() =>
            snapshotFromRenderSettings(values, { defaults, umbreonAvailable: true, mode: 'strict' }),
        ).toThrow();

        // A default the editor cannot show either lands on a placeholder.
        const odd = snapshotFromRenderSettings(
            fixtureValues({ backend: 'umbreon', [blockKey('umbreon', 'aoGather')]: 'Bogus' }),
            { defaults: { ...defaults, [blockKey('umbreon', 'aoGather')]: 'Bogus' }, umbreonAvailable: true },
        );
        expect(valueOf(odd.backendProps, 'aoGather')).toBe('Per output pixel');

        // A stored umbreon backend renders with POV-Ray in a build without it.
        expect(snapshotFromRenderSettings(fixtureValues({ backend: 'umbreon' }), { defaults, umbreonAvailable: false }).backend).toBe('povray');
        // "" is a backend nobody chose: the app default, silently, and not
        // written back as chosen.
        const fresh = snapshotFromRenderSettings(fixtureValues(), { defaults, umbreonAvailable: true });
        expect(fresh.backend).toBe('umbreon');
        expect(fresh.backendExplicit).toBe(false);
        expect(fresh.warnings).toEqual([]);
        expect(valuesFromSnapshot(fresh, { backendExplicit: false }).backend).toBe('');
        warn.mockRestore();
    });
});
