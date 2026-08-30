/**
 * @file dialogs/molSurfDensity.ts
 * @description Shared point-density input range for the two molecular-surface
 * dialogs (`MakeMolSurfDialog` creates a surface, `RegenMolSurfDialog` rebuilds
 * one). Both present the density as a `SliderField` (slider + number box +
 * stepper) over the same clamped integer range, so the range lives here once.
 */

/**
 * UXP XUL default: the density numberbox has `min="1"` and no explicit
 * `value=`, so it initialises to its min.
 */
export const DEFAULT_DENSITY = 1

/** Slider range for the point density (/A). Values are clamped into it. */
export const DENSITY_MIN = 1
export const DENSITY_MAX = 10

/** Clamp an arbitrary stored density into the slider's integer range. */
export function clampDensity(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_DENSITY
    return Math.min(DENSITY_MAX, Math.max(DENSITY_MIN, Math.round(n)))
}
