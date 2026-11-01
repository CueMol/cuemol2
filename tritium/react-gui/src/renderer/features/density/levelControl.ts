/**
 * @file features/density/levelControl.ts
 * @description How the Density map pane's Level field maps onto the map
 * renderer: which property it writes, in which unit and over which range, and
 * the caption that shows the same level in the other unit.
 *
 * Native mode writes `siglevel` in the map's native unit -- sigma multiples on
 * a crystallographic map, the top percent of grid points on a cryo-EM map.
 * Absolute mode writes `level` in absolute density units and C++ converts it
 * back through the map kind (marking `siglevel` modified). Pure, so the
 * mapping is testable without mounting the pane.
 */
import type { MapRendererPropName, MapRendererState } from '@renderer/worker/server/services/map/types'

export const SIGMA = String.fromCharCode(0x03c3)

export interface LevelControl {
    /** The property the field writes. */
    prop: Extract<MapRendererPropName, 'siglevel' | 'level'>
    value: number
    min: number
    max: number
    step: number
    unit: string
    /** The same level in the other unit (caption under the field). */
    hint: string
}

/**
 * Absolute-mode step from the displayed range. Mirrors UXP `updateWidget`
 * (lines 241-248): `10^floor(log10(rng/100))`, with a floor for `rng <= 0`.
 */
export function absoluteStep(rangeAbs: number): number {
    if (!Number.isFinite(rangeAbs) || rangeAbs <= 0) return 0.01
    return Math.pow(10, Math.floor(Math.log10(rangeAbs / 100)))
}

/** `range` when both ends are finite and ordered, else `fallback`. */
function rangeOr(range: [number, number], fallback: [number, number]): [number, number] {
    const [lo, hi] = range
    return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [lo, hi] : fallback
}

/**
 * Field parameters for the Level row.
 *
 * `DragNumericField` scales its drag rate to the range (three quarters of the
 * field sweeps min..max), so the range is the one the renderer offers for a
 * UI (`uiLevelRange` / `uiAbsLevelRange`): background to the top 0.01% of
 * grid points. Over the raw extremes, the masked background of a cryo-EM map
 * or an outlier maximum would take up most of the sweep and draw nothing.
 * The inspector still reaches the whole range.
 */
export function levelControlFor(state: MapRendererState | null): LevelControl {
    if (!state) {
        return { prop: 'siglevel', value: 0, min: -10, max: 10, step: 0.1, unit: SIGMA, hint: '' }
    }
    if (state.useAbsLevel) {
        const [min, max] = rangeOr(state.uiAbsLevelRange, [state.minLevel * state.denSigma, state.maxLevel * state.denSigma])
        const hint =
            state.levelUnit === 'percent'
                ? `= top ${state.siglevel.toFixed(2)} % of grid points`
                : `= ${state.siglevel.toFixed(2)} ${SIGMA}`
        return { prop: 'level', value: state.level, min, max, step: absoluteStep(max - min), unit: '', hint }
    }
    const abs = Number.isFinite(state.level) ? state.level.toPrecision(3) : '?'
    const hint = `= ${abs} (absolute)`
    if (state.levelUnit === 'percent') {
        const [min, max] = rangeOr(state.uiLevelRange, [0, 10])
        return { prop: 'siglevel', value: state.siglevel, min, max, step: 0.01, unit: '%', hint }
    }
    const [min, max] = rangeOr(state.uiLevelRange, [state.minLevel, state.maxLevel])
    return {
        prop: 'siglevel',
        value: state.siglevel,
        min,
        max,
        step: 0.1,
        unit: SIGMA,
        hint,
    }
}
