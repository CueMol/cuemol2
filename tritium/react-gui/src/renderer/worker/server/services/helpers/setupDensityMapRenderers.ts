// Runs in Web Worker thread. Creates preset contour renderers for density
// maps fetched via Get PDB. Mirrors UXP `doSetupRend` density-map branch
// (uxp_gui/cuemol2/base/content/renderer.js, openMapImpl loadFunc in
// netpdbopen.js).
//
// Color and sigma values are intentionally hardcoded — they match the
// preset chosen by UXP and ensure the density visualization is meaningful
// straight after download. Users can tune them later via renderer
// properties.

import type { WorkerContext } from '../../types/WorkerContext';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CObject } from '@cuemol/core/src/wrappers/Object';
import type { NewRendererCommand } from '@cuemol/core/src/wrappers/NewRendererCommand';
import type { MapRenderer } from '@cuemol/core/src/wrappers/MapRenderer';
import { getDefaultStyleName } from './getDefaultStyleName';
import { makeColor } from './makeColor';

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
    for (const spec of specs) {
        const cmd = ctx.cmdMgr.getCmd('new_renderer') as NewRendererCommand;
        cmd.target_object = obj;
        cmd.renderer_type = 'contour';
        cmd.renderer_name = spec.name;
        // Defer view recentering: callers run obj.fitView once after all
        // contours are created (matches UXP openMapImpl flow).
        cmd.recenter_view = false;
        cmd.default_style_name = getDefaultStyleName('contour');
        cmd.run();

        const rend = cmd.result_renderer as unknown as MapRenderer;
        rend.color = makeColor(ctx, spec.color, scene.uid);
        rend.siglevel = spec.sigma;
    }
}
