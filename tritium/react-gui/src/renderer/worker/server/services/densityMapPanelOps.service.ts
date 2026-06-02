/**
 * @file services/densityMapPanelOps.service.ts
 * @description Worker services backing the Density-map side panel
 * (`panel.densitymap`). Mirrors UXP `densitymap-panel.js`
 * (`cuemolui.panels.denmap.*`):
 *   - `listMapRenderers`    -- ObjMenuList filter for map renderers
 *   - `getMapRendererState` -- updateWidget read of all driven props
 *   - `setMapRendererProp`  -- changeProp / validateWidget writer
 *   - `redrawMapCenter`     -- onRedraw (recenter map on view center)
 *
 * The renderer-type filter mirrors UXP `denmap.mMapList`:
 *   contour | isosurf | gpu_mapmesh | gpu_mapvol
 *
 * The "Show unitcell" action reuses `showUnitCellRenderer` from
 * `symmetryPanelOps.service.ts`; the panel resolves the parent obj id
 * via the entry it gets from `listMapRenderers`.
 *
 * Multi-gradient color mode is out of scope (user-directed): the
 * `colormode` property is not surfaced and `setMapRendererProp` does
 * not accept it.
 */

import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Vector } from '@cuemol/core/src/wrappers/Vector';
import type { AbstractColor } from '@cuemol/core/src/wrappers/AbstractColor';
import type { WorkerContext } from '../types/WorkerContext';
import {
    getSceneOrNull,
    getViewSceneOrNull,
} from './helpers/sceneResolver';
import { withUndoTxn } from './withUndoTxn';
import { makeColor } from './helpers/makeColor';
import { parseSceneTreeJSON } from '../../shared/sceneTreeTypes';

/** Renderer type names the panel exposes (UXP ObjMenuList filter). */
const MAP_RENDERER_TYPES = new Set<string>([
    'contour',
    'isosurf',
    'gpu_mapmesh',
    'gpu_mapvol',
]);

// --- listMapRenderers ---

export interface ListMapRenderersArgs {
    sceneId: number;
}

export interface MapRendererEntry {
    /** C++ uid of the renderer. */
    rendId: number;
    /** Renderer name (e.g. "isosurf1"); may be empty. */
    rendName: string;
    /** Renderer type name (one of the MAP_RENDERER_TYPES). */
    type: string;
    /** Parent object uid (for the Cell button + display label). */
    objId: number;
    /** Parent object name (for the display label). */
    objName: string;
}

export interface ListMapRenderersResult {
    items: MapRendererEntry[];
}

/**
 * Walk the scene tree and collect every renderer whose type matches the
 * UXP map-renderer filter. Renderers nested inside renderer groups are
 * included via `childNodes`.
 */
function listMapRenderers(
    ctx: WorkerContext,
    args: ListMapRenderersArgs,
): ListMapRenderersResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { items: [] };

    let json: string;
    try {
        json = scene.getSceneDataJSON();
    } catch {
        return { items: [] };
    }
    const tree = parseSceneTreeJSON(json);
    if (!tree) return { items: [] };

    const out: MapRendererEntry[] = [];
    for (const obj of tree.children) {
        if (obj.type !== 'object') continue;
        collectMapRenderers(obj.children, obj.id, obj.name, out);
    }
    return { items: out };
}

/**
 * Recursive helper that flattens an object's renderer subtree
 * (renderer + rendGroup nodes) into the MAP_RENDERER_TYPES filter.
 */
function collectMapRenderers(
    nodes: Array<{
        id: number;
        name: string;
        type: string;
        className: string;
        children: Array<unknown>;
    }>,
    objId: number,
    objName: string,
    out: MapRendererEntry[],
): void {
    for (const n of nodes) {
        if (n.type === 'renderer' && MAP_RENDERER_TYPES.has(n.className)) {
            out.push({
                rendId: n.id,
                rendName: n.name,
                type: n.className,
                objId,
                objName,
            });
        } else if (n.type === 'rendGroup') {
            collectMapRenderers(
                n.children as Array<{
                    id: number;
                    name: string;
                    type: string;
                    className: string;
                    children: Array<unknown>;
                }>,
                objId,
                objName,
                out,
            );
        }
    }
}

// --- getMapRendererState ---

export interface GetMapRendererStateArgs {
    sceneId: number;
    rendId: number;
}

/**
 * Snapshot of the props the panel drives. Server-side units only:
 * `siglevel`, `maxLevel`, `minLevel` are in sigma; the panel multiplies
 * by `denSigma` for the absolute-mode display.
 */
export interface MapRendererState {
    alpha: number;
    /** Stringified `rend.color`. Empty string when unreadable. */
    color: string;
    extent: number;
    siglevel: number;
    useAbsLevel: boolean;
    maxLevel: number;
    minLevel: number;
    maxExtent: number;
    /** Sigma scale factor from the parent ScalarObject; falls back to 1. */
    denSigma: number;
}

export interface GetMapRendererStateResult {
    state: MapRendererState | null;
}

function safeRead<T>(fn: () => T, fallback: T): T {
    try {
        return fn();
    } catch {
        return fallback;
    }
}

function getMapRendererState(
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
        extent: number;
        siglevel: number;
        use_abslevel: boolean;
        maxLevel: number;
        minLevel: number;
        maxExtent: number;
        getClientObj: () => { den_sigma: number } | null;
    };

    const denSigma = safeRead(() => {
        const obj = r.getClientObj();
        const v = obj ? obj.den_sigma : 1;
        return Number.isFinite(v) && v > 0 ? v : 1;
    }, 1);

    const color = safeRead(() => {
        const c = r.color;
        return c ? c.toString() : '';
    }, '');

    return {
        state: {
            alpha: safeRead(() => r.alpha, 1),
            color,
            extent: safeRead(() => r.extent, 0),
            siglevel: safeRead(() => r.siglevel, 0),
            useAbsLevel: safeRead(() => r.use_abslevel, false),
            maxLevel: safeRead(() => r.maxLevel, 10),
            minLevel: safeRead(() => r.minLevel, -10),
            maxExtent: safeRead(() => r.maxExtent, 100),
            denSigma,
        },
    };
}

// --- setMapRendererProp ---

/** Property names the panel may write. */
export type MapRendererPropName =
    | 'alpha'
    | 'extent'
    | 'siglevel'
    | 'use_abslevel'
    | 'color';

export interface SetMapRendererPropArgs {
    sceneId: number;
    rendId: number;
    propName: MapRendererPropName;
    /** For `color` this is a CueMol color string; otherwise number/boolean. */
    value: number | boolean | string;
    /**
     * Write mode (default `commit`). `preview` writes a numeric prop without an
     * undo txn for live drag feedback (not valid for `color`).
     */
    mode?: 'preview' | 'commit';
    /**
     * Pre-drag value, supplied with `mode: 'commit'` at the end of a realtime
     * drag, so the single recorded undo step is `originalValue -> value` rather
     * than `lastPreview -> value`. Numeric props only.
     */
    originalValue?: number;
}

export interface SetMapRendererPropResult {
    ok: boolean;
    error?: string;
}

function setMapRendererProp(
    ctx: WorkerContext,
    args: SetMapRendererPropArgs,
): SetMapRendererPropResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { ok: false, error: 'renderer not found' };

    // Live preview during a drag: numeric write without an undo txn (the view
    // still redraws via the prop-change event). `color` never previews.
    if (args.mode === 'preview' && args.propName !== 'color') {
        try {
            rend.setProp(args.propName, args.value);
        } catch (e) {
            return { ok: false, error: String(e) };
        }
        return { ok: true };
    }

    let err: string | null = null;
    // Realtime commit: restore the pre-drag value first (txn-free, not
    // recorded) so the single undo step is `originalValue -> value`.
    if (args.originalValue !== undefined && args.propName !== 'color') {
        try {
            rend.setProp(args.propName, args.originalValue);
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    }
    withUndoTxn(scene as Scene, 'Change map renderer prop', () => {
        try {
            if (args.propName === 'color') {
                // Use the typed property setter (same path as
                // `setRendererDefaultColor`): the wrapper layer
                // unwraps the AbstractColor for the C++ side, which is
                // what triggers the renderer's PROPCHG -> redraw path.
                const color = makeColor(ctx, String(args.value), scene.uid);
                (rend as unknown as { color: AbstractColor }).color = color;
            } else {
                rend.setProp(args.propName, args.value);
            }
        } catch (e) {
            err = String(e);
        }
    });
    if (err !== null) return { ok: false, error: err };
    return { ok: true };
}

// --- redrawMapCenter ---

export interface RedrawMapCenterArgs {
    sceneId: number;
    rendId: number;
    viewId: number;
}

export interface RedrawMapCenterResult {
    ok: boolean;
    /** True iff a center change was actually applied (false on small-movement guard). */
    moved: boolean;
    error?: string;
}

/**
 * Set the map renderer's `center` to the current view center, unless
 * the new center is within 0.1 A of the existing one (UXP small-movement
 * guard from `denmap.onRedraw`).
 */
function redrawMapCenter(
    ctx: WorkerContext,
    args: RedrawMapCenterArgs,
): RedrawMapCenterResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, moved: false, error: 'scene not found' };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { ok: false, moved: false, error: 'renderer not found' };

    const vs = getViewSceneOrNull(ctx, args.viewId);
    if (!vs) return { ok: false, moved: false, error: 'view not found' };

    let viewCenter: Vector | null = null;
    try {
        viewCenter = vs.view.getViewCenter() as Vector;
    } catch {
        return { ok: false, moved: false, error: 'view center unavailable' };
    }
    if (!viewCenter) return { ok: false, moved: false, error: 'view center unavailable' };

    const r = rend as unknown as { center: Vector };
    const distance = safeRead<number>(() => {
        const cur = r.center as unknown as { sub: (v: Vector) => { length: () => number } };
        return cur.sub(viewCenter as Vector).length();
    }, Number.POSITIVE_INFINITY);
    if (distance < 0.1) {
        return { ok: true, moved: false };
    }

    let err: string | null = null;
    withUndoTxn(scene as Scene, 'Change map renderer center', () => {
        try {
            // Typed setter: pass the wrapper itself (wrapper layer
            // unwraps for the C++ side and fires the PROPCHG that
            // triggers map redraw).
            r.center = viewCenter as Vector;
        } catch (e) {
            err = String(e);
        }
    });
    if (err !== null) return { ok: false, moved: false, error: err };
    return { ok: true, moved: true };
}

export const services = {
    listMapRenderers,
    getMapRendererState,
    setMapRendererProp,
    redrawMapCenter,
};
