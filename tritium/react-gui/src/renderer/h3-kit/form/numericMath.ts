/**
 * @file h3-kit/form/numericMath.ts
 * @description Shared numeric quantize / clamp / snap helpers for the form-kit
 * numeric controls. Both the Blender-style `DragNumericField` and the
 * slider-based `SliderField` (and its back-compat alias `SliderNumericField`)
 * derive their display precision and stored value from the same `step`-driven
 * math, so the rounding behaviour is defined here once instead of being
 * re-implemented per widget.
 *
 * All functions are pure and stateless.
 *
 * @module form/numericMath
 */

/**
 * Decimal places implied by `step` (0.1 -> 1, 0.01 -> 2, 1 -> 0). A
 * non-positive / non-finite `step` implies integer precision (0 decimals).
 *
 * @param step - The granularity of the value.
 * @returns Number of decimal places to display / round to.
 */
export function decimalsOf(step: number): number {
    if (!Number.isFinite(step) || step <= 0) return 0;
    return Math.max(0, -Math.floor(Math.log10(step)));
}

/**
 * Round `v` to the precision implied by `step`, stripping IEEE-754 drift that
 * otherwise accumulates across drag frames / stepper clicks (e.g. turns
 * `0.30000000000000004` into `0.3` for `step = 0.1`).
 *
 * @param v - Raw value.
 * @param step - Granularity that determines the rounding precision.
 * @returns `v` rounded to `decimalsOf(step)` places (unchanged when `step` is
 *   non-positive / non-finite).
 */
export function quantize(v: number, step: number): number {
    if (!Number.isFinite(step) || step <= 0) return v;
    return Number(v.toFixed(decimalsOf(step)));
}

/**
 * Clamp `v` into `[min, max]` and then quantize to the precision implied by
 * `step`. Used after every stepper click / drag frame so the stored value
 * stays inside range and free of float noise.
 *
 * @param v - Raw value.
 * @param min - Lower bound (inclusive).
 * @param max - Upper bound (inclusive).
 * @param step - Granularity for the final quantization.
 * @returns The clamped, quantized value.
 */
export function clampAndQuantize(v: number, min: number, max: number, step: number): number {
    return quantize(Math.min(max, Math.max(min, v)), step);
}

/**
 * Snap `v` to the nearest multiple of `snap` (absolute multiples measured from
 * 0). A non-positive / non-finite `snap` leaves `v` unchanged.
 *
 * @param v - Raw value.
 * @param snap - Snap granularity.
 * @returns `v` rounded to the nearest multiple of `snap`.
 */
export function snapTo(v: number, snap: number): number {
    if (!Number.isFinite(snap) || snap <= 0) return v;
    return Math.round(v / snap) * snap;
}
