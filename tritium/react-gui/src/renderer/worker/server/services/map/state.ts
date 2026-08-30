/**
 * @file worker/server/services/map/state.ts
 * @description One map renderer, as the panel row shows it.
 *
 * Reads are defensive: a property a particular map renderer type does not
 * have throws on access rather than returning undefined, and the panel shows
 * one row shape for all of them.
 */
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { AbstractColor } from '@cuemol/core/src/wrappers/AbstractColor';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { parseGenericProps } from '@renderer/worker/server/services/helpers/parseGenericProps';
import type {
    GetMapRendererStateArgs,
    GetMapRendererStateResult,
    MapRendererState,
} from './types';
export function safeRead<T>(fn: () => T, fallback: T): T {
    try {
        return fn();
    } catch {
        return fallback;
    }
}

export function getMapRendererState(
    ctx: WorkerContext,
    args: GetMapRendererStateArgs,
): GetMapRendererStateResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { state: null };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { state: null };

    const r = rend as unknown as {
        alpha: number;
        color: AbstractColor;
        colormode: string;
        extent: number;
        siglevel: number;
        use_abslevel: boolean;
        maxLevel: number;
        minLevel: number;
        maxExtent: number;
        region_mode_resolved: string;
        getClientObj: () => { den_sigma: number; map_type_resolved?: string } | null;
    };

    const denSigma = safeRead(() => {
        const obj = r.getClientObj();
        const v = obj ? obj.den_sigma : 1;
        return Number.isFinite(v) && v > 0 ? v : 1;
    }, 1);

    const regionResolved = safeRead(() => {
        const v = r.region_mode_resolved as unknown;
        return typeof v === 'string' ? v : '';
    }, '');

    const mapType = safeRead(() => {
        const obj = r.getClientObj();
        const v = obj ? (obj.map_type_resolved as unknown) : '';
        return typeof v === 'string' ? v : '';
    }, '');

    const color = safeRead(() => {
        const c = r.color;
        return c ? c.toString() : '';
    }, '');

    const defaults = readDefaultFlags(rend);

    return {
        state: {
            alpha: safeRead(() => r.alpha, 1),
            color,
            colormode: safeRead(() => {
                const v = r.colormode as unknown;
                return typeof v === 'string' ? v : '';
            }, ''),
            extent: safeRead(() => r.extent, 0),
            siglevel: safeRead(() => r.siglevel, 0),
            useAbsLevel: safeRead(() => r.use_abslevel, false),
            maxLevel: safeRead(() => r.maxLevel, 10),
            minLevel: safeRead(() => r.minLevel, -10),
            maxExtent: safeRead(() => r.maxExtent, 100),
            denSigma,
            regionResolved,
            mapType,
            defaults,
        },
    };
}

/**
 * Read the default flags for the realtime-drag props (`alpha` / `siglevel` /
 * `extent`) from the renderer's `getPropsJSON()` dump. The native addon does
 * not expose `isPropDefault` directly, so the generic-inspector parse path is
 * reused. Props without a default flag (or on parse failure) report `false`,
 * which falls the restore back to a plain value write.
 */
export function readDefaultFlags(rend: Renderer): MapRendererState['defaults'] {
    const fallback = { alpha: false, siglevel: false, extent: false };
    return safeRead(() => {
        const entries = parseGenericProps(JSON.parse(rend.getPropsJSON()));
        const isDefaultOf = (name: keyof MapRendererState['defaults']) =>
            entries.find((e) => e.key === name)?.isdefault ?? false;
        return {
            alpha: isDefaultOf('alpha'),
            siglevel: isDefaultOf('siglevel'),
            extent: isDefaultOf('extent'),
        };
    }, fallback);
}
