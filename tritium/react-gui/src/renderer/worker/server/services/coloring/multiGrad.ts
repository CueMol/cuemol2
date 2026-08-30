/**
 * @file worker/server/services/coloring/multiGrad.ts
 * @description Multi-gradient deck services: state snapshot
 * (`getMultiGradState`), histogram fetch (`getMultiGradHistogram`), the
 * single gradient write path (`setMultiGradNodes`, with the
 * preview/commit/abort drag protocol), and the color-map selector write
 * (`setMultiGradColorMap`).
 *
 * The C++ MultiGradient only fires its prop-changed event and records undo
 * through `copyFrom()`; `setNodesJSON` delegates to it, so a txn-free call
 * is a live preview (redraw only) and an in-txn call is one undo step.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { Object as CueObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { undoTxnResult, withUndoTxn } from '@renderer/worker/server/services/withUndoTxn';
import { ok, fail, failFrom } from '@renderer/worker/shared/result';
import { getMultiGradOrNull } from './colorTargets';
import type {
    GetMultiGradStateArgs,
    GetMultiGradStateResult,
    GetMultiGradHistogramArgs,
    GetMultiGradHistogramResult,
    SetMultiGradNodesArgs,
    SetMultiGradNodesResult,
    SetMultiGradColorMapArgs,
    SetMultiGradColorMapResult,
    MultiGradNodeDto,
    MultiGradMapObjectEntry,
    MultiGradMapStats,
    MultiGradPercentiles,
    MultiGradWriteNode,
} from './types';

/** Object class names accepted as multigrad color sources (ScalarObject). */
const SCALAR_MAP_CLASSES = new Set(['DensityMap', 'ElePotMap']);

/** Default undo label for gradient writes (matches UXP). */
const DEFAULT_LABEL = 'Change multi gradient color';

function packHex(r: number, g: number, b: number): string {
    const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
    const n = (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
    return `#${n.toString(16).padStart(6, '0').toUpperCase()}`;
}

/** Parse the C++ `getNodesJSON()` payload into display DTOs. */
function readNodes(mg: {
    getNodesJSON: () => string;
}): MultiGradNodeDto[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(mg.getNodesJSON());
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out: MultiGradNodeDto[] = [];
    for (const n of parsed) {
        const o = n as {
            value?: unknown; color?: unknown;
            r?: unknown; g?: unknown; b?: unknown;
        };
        if (typeof o?.value !== 'number' || typeof o?.color !== 'string') {
            continue;
        }
        out.push({
            value: o.value,
            color: o.color,
            hex: packHex(
                typeof o.r === 'number' ? o.r : 0,
                typeof o.g === 'number' ? o.g : 0,
                typeof o.b === 'number' ? o.b : 0,
            ),
        });
    }
    return out;
}

/** List the scene's scalar-map objects (DensityMap / ElePotMap). */
export function listScalarMapObjects(
    scene: Scene,
): MultiGradMapObjectEntry[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(scene.getSceneDataJSON());
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out: MultiGradMapObjectEntry[] = [];
    for (let i = 1; i < parsed.length; i++) {
        const obj = parsed[i] as { ID?: number; type?: string; name?: string };
        if (typeof obj?.ID !== 'number') continue;
        if (!SCALAR_MAP_CLASSES.has(obj?.type ?? '')) continue;
        out.push({
            objId: obj.ID,
            name: obj.name ?? '',
            className: obj.type ?? '',
        });
    }
    return out;
}

/** First scalar-map object name in the scene, or "" when none. */
export function findFirstScalarMapName(scene: Scene): string {
    const maps = listScalarMapObjects(scene);
    return maps.length > 0 ? maps[0].name : '';
}

/**
 * Resolve the renderer's color-map object (`getColorMapObj`). Returns null
 * when `color_mapname` is empty or names a non-existent object (the C++
 * method returns a null ObjectPtr, or throws when the renderer is not in a
 * scene).
 */
export function getColorMapObjOrNull(rend: Renderer): CueObject | null {
    try {
        const fn = (rend as unknown as {
            getColorMapObj?: () => CueObject | null;
        }).getColorMapObj;
        if (typeof fn !== 'function') return null;
        return fn.call(rend) ?? null;
    } catch {
        return null;
    }
}

function safeReadNumber(obj: unknown, prop: string): number | null {
    try {
        const v = (obj as Record<string, unknown>)[prop];
        return typeof v === 'number' ? v : null;
    } catch {
        return null;
    }
}

/** Read the den_* stats off a scalar map; null when any is unreadable. */
export function readMapStats(obj: CueObject): MultiGradMapStats | null {
    const min = safeReadNumber(obj, 'den_min');
    const max = safeReadNumber(obj, 'den_max');
    const mean = safeReadNumber(obj, 'den_mean');
    const sigma = safeReadNumber(obj, 'den_sigma');
    if (min === null || max === null || mean === null || sigma === null) {
        return null;
    }
    // Unlike the four stats above, a missing quant step is non-fatal:
    // it only relaxes a bin-width floor, so it degrades to 0
    // (continuous) instead of failing the whole read.
    const quantStep = safeReadNumber(obj, 'den_quant_step') ?? 0;
    return { min, max, mean, sigma, quantStep };
}

function safeReadString(obj: unknown, prop: string): string {
    try {
        const v = (obj as Record<string, unknown>)[prop];
        return typeof v === 'string' ? v : '';
    } catch {
        return '';
    }
}

/**
 * Read a rebinned histogram off the color-map object; null when the
 * object lacks `getHistogramJSON` or the payload is malformed.
 */
function readHistogramRange(
    mapObj: CueObject,
    min: number,
    max: number,
    nbins: number,
): { histo: number[]; nmax: number } | null {
    const getHisto = (mapObj as unknown as {
        getHistogramJSON?: (min: number, max: number, nbins: number) => string;
    }).getHistogramJSON;
    if (typeof getHisto !== 'function') return null;
    let parsed: { histo?: unknown; nmax?: unknown };
    try {
        parsed = JSON.parse(getHisto.call(mapObj, min, max, nbins));
    } catch {
        return null;
    }
    if (!Array.isArray(parsed.histo)) return null;
    return {
        histo: parsed.histo.filter(
            (v): v is number => typeof v === 'number',
        ),
        nmax: typeof parsed.nmax === 'number' ? parsed.nmax : 0,
    };
}

/**
 * Value range covering [loFrac, hiFrac] of the histogram mass, with
 * linear interpolation inside the boundary bins. Returns null for an
 * empty histogram or a degenerate domain.
 */
export function histogramPercentileRange(
    histo: readonly number[],
    min: number,
    max: number,
    loFrac: number,
    hiFrac: number,
): MultiGradPercentiles | null {
    const n = histo.length;
    if (n === 0 || !(max > min)) return null;
    let total = 0;
    for (const v of histo) total += v;
    if (!(total > 0)) return null;
    const binw = (max - min) / n;
    const valueAt = (frac: number): number => {
        const target = total * frac;
        let cum = 0;
        for (let i = 0; i < n; i++) {
            const b = histo[i];
            if (cum + b >= target) {
                const within = b > 0 ? (target - cum) / b : 0;
                return min + (i + within) * binw;
            }
            cum += b;
        }
        return max;
    };
    return { lo: valueAt(loFrac), hi: valueAt(hiFrac) };
}

/** Bin count for the percentile estimate (rebin of the cached base). */
const PERCENTILE_NBINS = 256;

/**
 * Upper bound on the full-range rebin used for `globalNmax`. Only an
 * extreme zoom-in (bin width thousands of times finer than the map
 * range) exceeds it; the caller then falls back to the window max.
 */
const GLOBAL_NMAX_BIN_CAP = 65536;

const FAIL_STATE: GetMultiGradStateResult = {
    ok: false,
    capable: false,
    colormode: '',
    colorMapName: '',
    nodes: [],
    mapObjects: [],
    mapStats: null,
    mapPercentiles: null,
    mapVoxelCount: null,
    mapPeakCount: null,
};

/**
 * Snapshot the renderer's multi-gradient state for the deck UI: capability,
 * colormode, color-map binding, gradient nodes (one `getNodesJSON` call),
 * the scene's selectable maps, and the resolved map's density stats.
 */
export function getMultiGradState(
    ctx: WorkerContext,
    args: GetMultiGradStateArgs,
): GetMultiGradStateResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return FAIL_STATE;
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return FAIL_STATE;

    const mg = getMultiGradOrNull(rend);
    if (!mg) return { ...FAIL_STATE, ok: true };

    const mapObj = getColorMapObjOrNull(rend);
    const mapStats = mapObj ? readMapStats(mapObj) : null;
    let mapPercentiles: MultiGradPercentiles | null = null;
    let mapVoxelCount: number | null = null;
    let mapPeakCount: number | null = null;
    if (mapObj && mapStats && mapStats.max > mapStats.min) {
        const h = readHistogramRange(
            mapObj, mapStats.min, mapStats.max, PERCENTILE_NBINS,
        );
        if (h) {
            mapPercentiles = histogramPercentileRange(
                h.histo, mapStats.min, mapStats.max, 0.025, 0.975,
            );
            // Same full-range pass also yields the totals that bound how
            // fine the display bins can usefully get.
            mapVoxelCount = h.histo.reduce((a, b) => a + b, 0);
            mapPeakCount = h.nmax;
        }
    }
    return {
        ok: true,
        capable: true,
        // enum props are strings at runtime despite the generated number type
        colormode: safeReadString(rend, 'colormode'),
        colorMapName: safeReadString(rend, 'color_mapname'),
        nodes: readNodes(mg),
        mapObjects: listScalarMapObjects(scene),
        mapStats,
        mapPercentiles,
        mapVoxelCount,
        mapPeakCount,
    };
}

/**
 * Rebinned histogram of the renderer's color-map object over [min, max].
 *
 * The returned JSON's own min/max describe the object's full range and are
 * ignored; `nmax` is the max bin count within the requested range, so the
 * UI can normalize bars against it.
 */
export function getMultiGradHistogram(
    ctx: WorkerContext,
    args: GetMultiGradHistogramArgs,
): GetMultiGradHistogramResult {
    const fail: GetMultiGradHistogramResult = {
        ok: false, histo: [], nmax: 0, globalNmax: null,
    };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail;
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return fail;
    const mapObj = getColorMapObjOrNull(rend);
    if (!mapObj) return fail;
    const h = readHistogramRange(mapObj, args.min, args.max, args.nbins);
    if (!h) return fail;

    // Global normalization factor: rebin the map's full density range on
    // the SAME grid (bin width + origin-0 alignment) and take its max.
    // The base histogram is cached C++-side, so this is one cheap rebin.
    let globalNmax: number | null = null;
    const binWidth = (args.max - args.min) / args.nbins;
    const stats = readMapStats(mapObj);
    if (stats && stats.max > stats.min && binWidth > 0) {
        const i0 = Math.floor(stats.min / binWidth + 1e-9);
        const i1 = Math.ceil(stats.max / binWidth - 1e-9);
        const nbinsFull = i1 - i0;
        if (nbinsFull > 0 && nbinsFull <= GLOBAL_NMAX_BIN_CAP) {
            const full = readHistogramRange(
                mapObj, i0 * binWidth, i1 * binWidth, nbinsFull,
            );
            if (full) globalNmax = full.nmax;
        }
    }
    return { ok: true, histo: h.histo, nmax: h.nmax, globalNmax };
}

function nodesToJSON(nodes: MultiGradWriteNode[]): string {
    return JSON.stringify(
        nodes.map((n) => ({ value: n.value, color: n.color })),
    );
}

/**
 * The single gradient write path.
 *
 * - `preview`: txn-free `setNodesJSON` -- fires the prop-changed event so
 *   the 3D view redraws, but records nothing for undo.
 * - `abort`: txn-free restore of `originalNodes`.
 * - `commit` (default): when `originalNodes` is given (drag release), first
 *   restore it txn-free so the single undo step inside the txn is
 *   `original -> final` (the genericProps restore-then-txn pattern), then
 *   write the final nodes inside one undo txn.
 */
export function setMultiGradNodes(
    ctx: WorkerContext,
    args: SetMultiGradNodesArgs,
): SetMultiGradNodesResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail('scene not found', 'not-found');
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return fail('renderer not found', 'not-found');
    const mg = getMultiGradOrNull(rend);
    if (!mg) return fail('renderer has no multi-gradient coloring', 'unsupported');

    const mode = args.mode ?? 'commit';

    if (mode === 'preview') {
        try {
            mg.setNodesJSON(nodesToJSON(args.nodes));
        } catch (e) {
            return failFrom(e);
        }
        return ok();
    }

    if (mode === 'abort') {
        if (!args.originalNodes) return fail('originalNodes are required to abort', 'invalid-args');
        try {
            mg.setNodesJSON(nodesToJSON(args.originalNodes));
        } catch (e) {
            return failFrom(e);
        }
        return ok();
    }

    // commit
    if (args.originalNodes) {
        try {
            mg.setNodesJSON(nodesToJSON(args.originalNodes));
        } catch (e) {
            return failFrom(e);
        }
    }
    return undoTxnResult(scene, args.label ?? DEFAULT_LABEL, () => {
        mg.setNodesJSON(nodesToJSON(args.nodes));
        return ok();
    });
}

/**
 * Bind the renderer to a different color-map object (`color_mapname`).
 */
export function setMultiGradColorMap(
    ctx: WorkerContext,
    args: SetMultiGradColorMapArgs,
): SetMultiGradColorMapResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { ok: false };
    if (!getMultiGradOrNull(rend)) return { ok: false };

    withUndoTxn(scene, 'Change color map', () => {
        (rend as unknown as { color_mapname: string }).color_mapname =
            args.mapName;
    });
    return { ok: true };
}
