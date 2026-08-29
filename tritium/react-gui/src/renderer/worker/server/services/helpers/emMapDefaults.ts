/**
 * @file worker/server/services/helpers/emMapDefaults.ts
 * @description Post-load adjustments for density maps opened through the
 * file-open dialog: the dialog's map-kind override (DensityMap `map_type`)
 * and the cryo-EM renderer defaults (absolute contour level enclosing the
 * top 1% of the grid points, the ChimeraX initial-contour rule; sigma-scaled
 * levels are meaningless on a masked EM map whose rmsd is dominated by
 * solvent), plus fitting the views to the whole map.
 *
 * Runs in the Web Worker thread (sync C++ wrappers, no await). Every wrapper
 * access is duck-typed: the DensityMap-only members (`map_type_resolved`,
 * `getLevelAtTopFraction`, `fitView`) are probed before use so the helpers
 * are no-ops for other scalar objects and renderer types.
 */
import type { FormatOptions } from '@renderer/worker/shared/fileOpenTypes';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { View } from '@cuemol/core/src/wrappers/View';

const log = console;

/** Fraction of the grid points the initial cryo-EM contour encloses. */
export const EM_INITIAL_TOP_FRACTION = 0.01;

type Bag = Record<string, unknown>;

/**
 * Apply the dialog's map-kind override to a freshly read map.
 *
 * @param obj - the loaded object (a DensityMap for the ccp4map format)
 * @param format - the dialog's format options
 * @returns true when an override ('xtal' / 'em') was written
 */
export function applyMapTypeChoice(obj: unknown, format: FormatOptions): boolean {
    if (format.kind !== 'ccp4map') return false;
    const choice = format.options.mapType;
    if (choice !== 'xtal' && choice !== 'em') return false;
    const o = obj as Bag;
    if (typeof o.map_type_resolved !== 'string') return false;
    try {
        // enum props take their string id at runtime
        o.map_type = choice;
        return true;
    } catch (e) {
        log.warn('[worker] applyMapTypeChoice: map_type write failed:', e);
        return false;
    }
}

/**
 * True when `obj` is a DensityMap whose effective kind is cryo-EM.
 */
export function isEmDensityMap(obj: unknown): boolean {
    const o = obj as Bag;
    try {
        return typeof o.map_type_resolved === 'string' && o.map_type_resolved === 'em';
    } catch {
        return false;
    }
}

/**
 * Give a map renderer on a cryo-EM map its EM defaults: absolute level
 * mode with the level enclosing the top 1% of the grid points.
 *
 * @returns true when the defaults were applied (the map is cryo-EM and the
 * renderer has a contour level)
 */
export function applyEmMapDefaults(obj: unknown, rend: unknown): boolean {
    if (!isEmDensityMap(obj)) return false;
    const o = obj as Bag & { getLevelAtTopFraction?: (frac: number) => number };
    const r = rend as Bag;
    if (typeof o.getLevelAtTopFraction !== 'function') return false;
    if (typeof r.siglevel !== 'number') return false;
    try {
        const level = o.getLevelAtTopFraction(EM_INITIAL_TOP_FRACTION);
        if (Number.isFinite(level)) {
            // `level` is the absolute-unit view of siglevel (nopersist)
            r.level = level;
        }
        r.use_abslevel = true;
        return true;
    } catch (e) {
        log.warn('[worker] applyEmMapDefaults failed:', e);
        return false;
    }
}

/**
 * Fit every view of the scene to the whole map (DensityMap.fitView).
 */
export function fitViewsToMap(scene: Scene, obj: unknown): void {
    const o = obj as Bag & { fitView?: (view: View, dummy: boolean) => void };
    if (typeof o.fitView !== 'function') return;
    const uidStr = (scene as unknown as { view_uids?: string }).view_uids;
    if (!uidStr) return;
    for (const tok of uidStr.split(',')) {
        const uid = Number(tok.trim());
        if (!Number.isFinite(uid)) continue;
        try {
            const view = scene.getView(uid) as View | null;
            if (view) o.fitView(view, false);
        } catch (e) {
            log.warn(`[worker] fitViewsToMap: fitView failed for view ${uid}:`, e);
        }
    }
}
