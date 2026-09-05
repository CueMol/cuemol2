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

/**
 * Field parameters for the Level row.
 *
 * `DragNumericField` scales its drag rate to the range (three quarters of the
 * field sweeps min..max), so the percent range is capped at 10: over 0..100
 * the useful 0.1..5 percent band would be a few pixels wide.
 */
export function levelControlFor(state: MapRendererState | null): LevelControl {
    if (!state) {
        return { prop: 'siglevel', value: 0, min: -10, max: 10, step: 0.1, unit: SIGMA, hint: '' }
    }
    if (state.useAbsLevel) {
        const min = state.minLevel * state.denSigma
        const max = state.maxLevel * state.denSigma
        const hint =
            state.levelUnit === 'percent'
                ? `= top ${state.siglevel.toFixed(2)} % of grid points`
                : `= ${state.siglevel.toFixed(2)} ${SIGMA}`
        return { prop: 'level', value: state.level, min, max, step: absoluteStep(max - min), unit: '', hint }
    }
    const abs = Number.isFinite(state.level) ? state.level.toPrecision(3) : '?'
    const hint = `= ${abs} (absolute)`
    if (state.levelUnit === 'percent') {
        return { prop: 'siglevel', value: state.siglevel, min: 0, max: 10, step: 0.01, unit: '%', hint }
    }
    return {
        prop: 'siglevel',
        value: state.siglevel,
        min: state.minLevel,
        max: state.maxLevel,
        step: 0.1,
        unit: SIGMA,
        hint,
    }
}
