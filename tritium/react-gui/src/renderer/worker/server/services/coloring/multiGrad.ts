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
import { recordOp } from '@renderer/worker/server/actions/serviceOps';
import { ok, fail, failFrom } from '@renderer/worker/shared/result';
import { getMultiGradOrNull, resolveMultiGrad } from './colorTargets';
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

// --- Atom values: a B-factor coloring's gradient is over these, not a map ---

/**
 * The values a `BfacColoring` colours `host`'s atoms by (B-factor or
 * occupancy, one per atom), read in one call (`MolCoord.getPropArray`).
 * Null for the distance-from-centre mode (no per-atom array) or when the
 * molecule cannot be reached.
 */
function readAtomValues(ctx: WorkerContext, host: Renderer, targetKind: 'object' | 'renderer' | undefined): Float32Array | null {
    try {
        const coloring = (host as unknown as { coloring?: unknown }).coloring;
        const mode = safeReadString(coloring, 'mode');
        if (mode !== 'bfac' && mode !== 'occ') return null;
        const mol = targetKind === 'object'
            ? (host as unknown)
            : (host as unknown as { getClientObj: () => unknown }).getClientObj();
        const ba = (mol as { getPropArray?: (p: string) => unknown } | null)?.getPropArray?.(mode);
        if (!ba) return null;
        const bytes = ctx.svc.copyToTypedArray(ba) as Uint8Array;
        // A copy of its own, so the float view starts at offset 0.
        return new Float32Array(bytes.slice().buffer);
    } catch {
        return null;
    }
}

/** min / max / mean / sigma of the atom values, as a map's stats read (continuous: no quant step). */
function atomStats(v: Float32Array): MultiGradMapStats | null {
    if (v.length === 0) return null;
    let min = Infinity, max = -Infinity, sum = 0;
    for (const x of v) { if (x < min) min = x; if (x > max) max = x; sum += x; }
    const mean = sum / v.length;
    let ss = 0;
    for (const x of v) ss += (x - mean) * (x - mean);
    return { min, max, mean, sigma: Math.sqrt(ss / v.length), quantStep: 0 };
}

/** Counts of the atom values in `nbins` equal bins over [min, max] (max in the last bin). */
function atomHistogram(v: Float32Array, min: number, max: number, nbins: number): { histo: number[]; nmax: number } | null {
    if (!(max > min) || nbins <= 0) return null;
    const histo = new Array<number>(nbins).fill(0);
    const w = (max - min) / nbins;
    for (const x of v) {
        if (x < min || x > max) continue;
        histo[Math.min(nbins - 1, Math.floor((x - min) / w))]++;
    }
    return { histo, nmax: Math.max(...histo) };
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
    const target = resolveMultiGrad(scene, args);
    if ('error' in target) return target.code === 'not-found' ? FAIL_STATE : { ...FAIL_STATE, ok: true };
    const { host: rend, mg } = target;

    // A coloring's gradient (B-factor) is over the atom values, not a map.
    if (args.gradient === 'coloring') {
        const values = readAtomValues(ctx, rend, args.targetKind);
        const stats = values ? atomStats(values) : null;
        const h = values && stats ? atomHistogram(values, stats.min, stats.max, PERCENTILE_NBINS) : null;
        return {
            ok: true,
            capable: true,
            colormode: '',
            colorMapName: '',
            nodes: readNodes(mg),
            mapObjects: [],
            mapStats: stats,
            mapPercentiles: h && stats ? histogramPercentileRange(h.histo, stats.min, stats.max, 0.025, 0.975) : null,
            mapVoxelCount: values ? values.length : null,
            mapPeakCount: h ? h.nmax : null,
        };
    }
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
    const target = resolveMultiGrad(scene, args);
    if ('error' in target) return fail;
    if (args.gradient === 'coloring') {
        const values = readAtomValues(ctx, target.host, args.targetKind);
        const h = values ? atomHistogram(values, args.min, args.max, args.nbins) : null;
        if (!values || !h) return fail;
        // Same bin width and origin-0 alignment over the full value range, as for a map.
        const stats = atomStats(values);
        const w = (args.max - args.min) / args.nbins;
        let globalNmax: number | null = null;
        if (stats && stats.max > stats.min && w > 0) {
            const i0 = Math.floor(stats.min / w + 1e-9);
            const i1 = Math.ceil(stats.max / w - 1e-9);
            if (i1 > i0 && i1 - i0 <= GLOBAL_NMAX_BIN_CAP) globalNmax = atomHistogram(values, i0 * w, i1 * w, i1 - i0)?.nmax ?? null;
        }
        return { ok: true, histo: h.histo, nmax: h.nmax, globalNmax };
    }
    const mapObj = getColorMapObjOrNull(target.host);
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

/** Gradient nodes as `set_multigrad_nodes` takes them: `value colour; value colour; ...`. */
export function multiGradNodesText(nodes: readonly MultiGradWriteNode[]): string {
    return nodes.map((n) => `${n.value} ${n.color}`).join('; ');
}

/**
 * The nodes `multiGradNodesText` wrote, or why the text is not such a list.
 * Empty text is no nodes: it clears the gradient (a `BfacColoring` then
 * colours by its two-colour ramp again), as the deck's Delete all writes it.
 */
export function parseMultiGradNodes(text: string): MultiGradWriteNode[] | { error: string } {
    const out: MultiGradWriteNode[] = [];
    for (const part of text.split(';')) {
        const t = part.trim();
        if (t === '') continue;
        const m = /^(\S+)\s+(.+)$/.exec(t);
        const value = m ? Number(m[1]) : NaN;
        if (!m || !Number.isFinite(value)) return { error: `"${t}" is not "<value> <colour>"` };
        out.push({ value, color: m[2].trim() });
    }
    return out;
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
    const target = resolveMultiGrad(scene, args);
    if ('error' in target) return fail(target.error, target.code);
    const { mg } = target;

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
        // The defaults (a renderer, its own gradient) are left out, as older records have them.
        recordOp(ctx, scene.uid, 'set_multigrad_nodes', {
            rendId: args.rendId,
            nodes: multiGradNodesText(args.nodes),
            nodeType: args.targetKind === 'object' ? 'object' : null,
            gradient: args.gradient === 'coloring' ? 'coloring' : null,
        }, ['rendId']);
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
        recordOp(ctx, scene.uid, 'set_node_prop', {
            nodeType: 'renderer',
            nodeId: args.rendId,
            prop: 'color_mapname',
            value: args.mapName,
        }, ['nodeId']);
        (rend as unknown as { color_mapname: string }).color_mapname =
            args.mapName;
    });
    return { ok: true };
}
