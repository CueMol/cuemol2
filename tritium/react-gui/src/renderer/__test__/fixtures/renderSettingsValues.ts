/**
 * @file __test__/fixtures/renderSettingsValues.ts
 * @description Test-only copy of what a fresh C++ RenderSettings holds: the
 * defaults declared in src/modules/rendering/RenderSettings.qif and its block
 * classes, keyed the way the worker hands them over (`key` for the common
 * settings, `<backend>.key` for a block).
 *
 * Production code carries no such table -- the editor always starts from the
 * real object -- so a drift between this file and the .qif affects these
 * tests only. Keep it in step when a default changes.
 */

import type { PropDef } from '@renderer/data/rendererProperties';
import type { RenderBackendId, RenderPropSpec } from '@renderer/data/renderSettings';
import { backendSpecs } from '@renderer/features/render/propMath';
import {
    snapshotFromRenderSettings,
    withValues,
    type LoadedRenderSettings,
} from '@renderer/features/render/sceneRenderSettings';
import type { RenderSettingsValues } from '@renderer/worker/shared/renderSettingsValues';

type Value = string | number | boolean;

const COMMON: Record<string, Value> = {
    backend: '',
    width: 1200,
    height: 1200,
    unit: 'px',
    dpi: 600,
    transparentBg: false,
    postBlend: true,
    pixelLabels: false,
    projection: 'perspective',
    stereoMode: 'none',
    stereoDepth: 0.03,
    clipPlane: true,
    numThreads: 2,
    edgeLines: true,
};

const POVRAY: Record<string, Value> = {
    radiosityMode: 'Disable',
    shadow: false,
    lightDefault: true,
    lightSpread: 1,
    lightIntensity: 1.3,
    flashFraction: 0.6,
    ambientFraction: 0,
};

const UMBREON: Record<string, Value> = {
    supersample: 3,
    aoEnabled: false,
    aoSamples: 64,
    aoDistance: 0,
    aoIntensity: 1,
    aoDiffuseFactor: 1,
    aoMultiScale: true,
    aoBentNormal: true,
    aoLowDiscrepancy: true,
    aoGather: 'Per output pixel',
    shadows: false,
    shadowSamples: 1,
    lightRadius: 0,
    creaseLimit: -1,
    edgeRise: 0.5,
    contactEdges: false,
    outlineFarDepth: 0.95,
    useGI: true,
    giSamples: '32',
    denoise: 'OIDN',
    giSkyGradient: true,
    giGroundColor: '#666666',
    lightIntensity: 1.2,
    flashFraction: 0.05,
    ambientFraction: 0.4,
};

// The NPR block inherits the umbreon properties (GI keys included) with the
// direct-lighting defaults, plus the hatching properties.
const UMBREON_NPR: Record<string, Value> = {
    ...UMBREON,
    useGI: false,
    lightIntensity: 1.55,
    flashFraction: 0.6,
    hatchStyle: 'richardson',
    hatchColoring: 'Style default',
    hatchDensity: 1,
    hatchWidthScale: 1,
    hatchCustomInk: false,
    hatchInkColor: '#000000',
    hatchCustomPaper: false,
    hatchPaperColor: '#ffffff',
    hatchDefaultEdges: true,
    hatchLayersSpec: '',
    hatchToneSpec: '',
};

function prefixed(prefix: string, block: Record<string, Value>): RenderSettingsValues {
    return Object.fromEntries(Object.entries(block).map(([k, v]) => [prefix + k, v]));
}

/** Every stored key at its declared default. */
export const RENDER_SETTINGS_DEFAULTS: RenderSettingsValues = {
    ...COMMON,
    ...prefixed('povray.', POVRAY),
    ...prefixed('umbreon.', UMBREON),
    ...prefixed('umbreon_npr.', UMBREON_NPR),
};

/** The defaults with some keys overridden, as a scene might store them. */
export const fixtureValues = (overrides: RenderSettingsValues = {}): RenderSettingsValues => ({
    ...RENDER_SETTINGS_DEFAULTS,
    ...overrides,
});

/** Catalog rows carrying the fixture values (`prefix` = `<backend>.` for a block). */
export const fixtureProps = (specs: RenderPropSpec[], prefix = ''): PropDef[] =>
    withValues(specs, RENDER_SETTINGS_DEFAULTS, RENDER_SETTINGS_DEFAULTS, { prefix });

/** A backend's rows at their defaults. */
export const fixtureBackendProps = (backend: RenderBackendId): PropDef[] =>
    fixtureProps(backendSpecs(backend), `${backend}.`);

/** The editor state a scene holding `overrides` loads as (strict: the fixture must validate). */
export const fixtureLoaded = (
    overrides: RenderSettingsValues = {},
    umbreonAvailable = true,
): LoadedRenderSettings =>
    snapshotFromRenderSettings(fixtureValues(overrides), {
        defaults: RENDER_SETTINGS_DEFAULTS,
        umbreonAvailable,
        mode: 'strict',
    });
