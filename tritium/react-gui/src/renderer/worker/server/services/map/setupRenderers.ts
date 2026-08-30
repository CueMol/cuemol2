// Runs in Web Worker thread. Creates preset contour renderers for density
// maps fetched via Get PDB. Mirrors UXP `doSetupRend` density-map branch
// (uxp_gui/cuemol2/base/content/renderer.js, openMapImpl loadFunc in
// netpdbopen.js).
//
// Color and sigma values are intentionally hardcoded -- they match the
// preset chosen by UXP and ensure the density visualization is meaningful
// straight after download. Users can tune them later via renderer
// properties.
//
// Uses `obj.createRenderer(type)` directly rather than the
// `NewRendererCommand` property-setter pattern: the setter
// `cmd.target_object = obj` corrupts `obj.m_thisname` via
// `setupParentData`, which then breaks the undo path through any
// child-property mutation on obj (see `setupRenderer.service.ts` header
// for the full chain). UXP avoids this by calling createRenderer
// directly; we do the same here.

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CObject } from '@cuemol/core/src/wrappers/Object';
import type { MapRenderer } from '@cuemol/core/src/wrappers/MapRenderer';
import { getDefaultStyleName } from '../helpers/getDefaultStyleName';
import { makeColor } from '../helpers/makeColor';
export type DensityMapType = '2fofc' | 'fofc';

interface ContourSpec {
    name: string;
    color: string;
    sigma: number;
}

const SPEC_2FOFC: ContourSpec[] = [
    { name: 'contour1', color: '#0000FF', sigma: 1.0 },
];

const SPEC_FOFC: ContourSpec[] = [
    { name: 'pos-cont', color: '#00FF00', sigma:  3.0 },
    { name: 'neg-cont', color: '#FF0000', sigma: -3.0 },
];

export function setupDensityMapRenderers(
    ctx: WorkerContext,
    scene: Scene,
    obj: CObject,
    mapType: DensityMapType,
): void {
    const specs = mapType === '2fofc' ? SPEC_2FOFC : SPEC_FOFC;
    const styleName = getDefaultStyleName('contour');
    for (const spec of specs) {
        const rend = (obj as unknown as {
            createRenderer: (type: string) => MapRenderer | null;
        }).createRenderer('contour');
        if (!rend) continue;
        (rend as unknown as { name: string }).name = spec.name;
        if (styleName) {
            (rend as unknown as { applyStyles: (n: string) => void }).applyStyles(styleName);
        }
        rend.color = makeColor(ctx, spec.color, scene.uid);
        rend.siglevel = spec.sigma;
        // Callers run obj.fitView once after all contours are created
        // (matches UXP openMapImpl flow), so we deliberately do not
        // recenter each renderer here.
    }
}
