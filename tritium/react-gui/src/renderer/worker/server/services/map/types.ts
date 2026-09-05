/**
 * @file worker/server/services/map/types.ts
 * @description Shapes for the density-map panel calls, and which renderer
 * types count as map renderers.
 */
import { type Result } from '@renderer/worker/shared/result';
/** Renderer type names the panel exposes (UXP ObjMenuList filter). */
export const MAP_RENDERER_TYPES = new Set<string>([
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

export interface GetMapRendererStateArgs {
    sceneId: number;
    rendId: number;
}

/**
 * Snapshot of the props the panel drives. `siglevel` is in the map's native
 * unit (`levelUnit`), `level` is the same contour in absolute density units;
 * `maxLevel` / `minLevel` are the density range in sigma multiples, so times
 * `denSigma` they bound the absolute-mode slider.
 */
export interface MapRendererState {
    alpha: number;
    /** Stringified `rend.color`. Empty string when unreadable. */
    color: string;
    /**
     * Renderer colormode as a string (e.g. "solid", "multigrad"; enum
     * props are strings at runtime). Drives the pane's Solid /
     * Multi-gradient radio pair and the inline gradient editor.
     */
    colormode: string;
    extent: number;
    siglevel: number;
    useAbsLevel: boolean;
    /**
     * The contour level in absolute density units (`rend.level`, the view of
     * `siglevel` resolved through the map kind). The absolute-mode slider
     * shows and writes this.
     */
    level: number;
    /**
     * Native unit of `siglevel`: sigma multiples on a crystallographic map,
     * top percent of grid points on a cryo-EM map.
     */
    levelUnit: 'sigma' | 'percent';
    maxLevel: number;
    minLevel: number;
    maxExtent: number;
    /** Sigma scale factor from the parent ScalarObject; falls back to 1. */
    denSigma: number;
    /**
     * Effective display region policy ("box" or "full") from the renderer's
     * read-only `region_mode_resolved`. In the full region the whole map is
     * marched, so the Extent slider has no effect. Empty string when the
     * renderer has no such prop (older addon).
     */
    regionResolved: string;
    /**
     * Effective map kind ("xtal" or "em") from the parent DensityMap's
     * read-only `map_type_resolved`; empty string for other scalar objects.
     */
    mapType: string;
    /**
     * Per-prop default flags (flag-based, from the C++ default state) for the
     * realtime-drag props. The panel freezes these at drag start so the commit /
     * abort restore can revert the default flag, not just the value.
     */
    defaults: {
        alpha: boolean;
        siglevel: boolean;
        extent: boolean;
    };
}

export interface GetMapRendererStateResult {
    state: MapRendererState | null;
}

/**
 * Property names the panel may write. `colormode` takes a string enum id
 * (e.g. "solid") and is commit-only (never previewed); switching TO
 * multigrad routes through `setRendererColoring` instead so the
 * color-map default + gradient seed logic applies.
 */
export type MapRendererPropName =
    | 'alpha'
    | 'extent'
    | 'siglevel'
    /** Absolute-unit write of the level; C++ converts and marks `siglevel` modified. */
    | 'level'
    | 'use_abslevel'
    | 'colormode'
    | 'color';

export interface SetMapRendererPropArgs {
    sceneId: number;
    rendId: number;
    propName: MapRendererPropName;
    /** For `color` this is a CueMol color string; otherwise number/boolean. */
    value: number | boolean | string;
    /**
     * Write mode (default `commit`). `preview` writes a numeric prop without an
     * undo txn for live drag feedback (not valid for `color`). `abort` restores
     * the pre-drag snapshot (value + default flag) without an undo txn.
     */
    mode?: 'preview' | 'commit' | 'abort';
    /**
     * Pre-drag value, supplied with `mode: 'commit'` at the end of a realtime
     * drag, so the single recorded undo step is `originalValue -> value` rather
     * than `lastPreview -> value`. Numeric props only.
     */
    originalValue?: number;
    /**
     * Pre-drag default flag, supplied with `mode: 'commit'` / `'abort'`. When
     * true, the restore uses `resetProp` (default flag + value) instead of a
     * bare `setProp`, so undo reverts the default state too. Numeric props only.
     */
    originalWasDefault?: boolean;
}

export type SetMapRendererPropResult = Result;

export interface RedrawMapCenterArgs {
    sceneId: number;
    rendId: number;
    viewId: number;
}
