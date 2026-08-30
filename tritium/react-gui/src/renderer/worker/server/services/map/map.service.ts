/**
 * @file worker/server/services/map/map.service.ts
 * @description Density maps: the registry entry for the whole folder.
 *
 * Everything a density map needs from the worker is here -- probing a file's
 * header before it is read, streaming it in, picking MTZ columns, and then
 * the panel that lists the map renderers of a scene and edits them.
 *
 * The panel is deliberately not a property inspector. A map renderer's
 * settings are read and written through named calls rather than the generic
 * property bridge, because the panel shows one row per renderer with the few
 * settings that matter, and because changing the contour level has to move
 * the map's centre with the view.
 */

import { listMapRenderers } from './renderers';
import { getMapRendererState } from './state';
import { setMapRendererProp, redrawMapCenter } from './props';
import { probeMapHeader } from './probeHeader';
import { streamLoadDensityMap } from './streamLoad';
import { getMtzColumnInfo } from './mtzColumns';
export const services = {
    listMapRenderers,
    getMapRendererState,
    setMapRendererProp,
    redrawMapCenter,
    probeMapHeader,
    streamLoadDensityMap,
    getMtzColumnInfo,
};

export type * from './types';
export type * from './props';
export type { MapHeaderInfo } from '@renderer/worker/shared/mapHeader';
export { LARGE_MAP_VOXELS, suggestSubsample } from '@renderer/worker/shared/mapHeader';
export type * from './probeHeader';
export type * from './streamLoad';
export type * from './mtzColumns';
