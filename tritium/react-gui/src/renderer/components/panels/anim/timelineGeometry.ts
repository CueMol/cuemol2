/**
 * @file components/panels/anim/timelineGeometry.ts
 * @description Pure geometry / formatting helpers for the animation timeline.
 *
 * Time is in milliseconds throughout; `pxPerMs` is the horizontal scale. These
 * helpers are side-effect free so they can be unit-tested without React.
 */

/** Minimum horizontal scale (very zoomed out). */
export const MIN_PX_PER_MS = 0.004;
/** Maximum horizontal scale (very zoomed in: 1ms = 4px). */
export const MAX_PX_PER_MS = 4;
/** Default horizontal scale (0.1px/ms -> 1s = 100px). */
export const DEFAULT_PX_PER_MS = 0.1;

/** Clamp a scale into the allowed range. */
export function clampPxPerMs(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_PX_PER_MS;
  return Math.min(MAX_PX_PER_MS, Math.max(MIN_PX_PER_MS, v));
}

/** Horizontal pixel offset for a time (ms) at a given scale. */
export function msToPx(ms: number, pxPerMs: number): number {
  return ms * pxPerMs;
}

/** "Nice" ruler tick steps (ms) in ascending order. */
const TICK_STEPS_MS = [
  50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 15000, 30000, 60000,
  120000, 300000, 600000, 1200000, 3600000,
];

/**
 * Choose a tick step (ms) so adjacent labels sit about `targetPx` apart.
 *
 * @param pxPerMs - Current horizontal scale.
 * @param targetPx - Desired pixel spacing between major ticks.
 */
export function niceTickStepMs(pxPerMs: number, targetPx = 72): number {
  const wantMs = targetPx / Math.max(pxPerMs, 1e-9);
  for (const step of TICK_STEPS_MS) {
    if (step >= wantMs) return step;
  }
  return TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
}

/** Format a millisecond value as a short ruler label given the tick step. */
export function formatTimeLabel(ms: number, stepMs: number): string {
  const s = ms / 1000;
  if (stepMs < 1000) return `${s.toFixed(2)}s`;
  if (stepMs < 10000) return `${s.toFixed(1)}s`;
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
}

/** Format a millisecond value as a `m:ss.mmm` transport readout. */
export function formatClock(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const a = Math.abs(ms);
  const totalSec = Math.floor(a / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const milli = Math.round(a % 1000);
  return `${sign}${m}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

/** Content width (px) for a timeline of `lengthMs`, with a sensible minimum. */
export function timelineWidthPx(
  lengthMs: number,
  pxPerMs: number,
  minPx = 320,
): number {
  return Math.max(minPx, Math.ceil(lengthMs * pxPerMs) + 40);
}

/** Compute the scale that fits `lengthMs` into `availPx`. */
export function fitPxPerMs(lengthMs: number, availPx: number): number {
  if (lengthMs <= 0 || availPx <= 0) return DEFAULT_PX_PER_MS;
  return clampPxPerMs((availPx - 40) / lengthMs);
}
