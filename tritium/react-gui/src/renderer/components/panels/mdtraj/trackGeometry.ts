/**
 * @file components/panels/mdtraj/trackGeometry.ts
 * @description Pure geometry / formatting helpers for the MD trajectory track.
 *
 * The horizontal axis is FRAME index (not time); `pxPerFrame` is the scale.
 * These helpers are side-effect free so they can be unit-tested without React.
 * They mirror `anim/timelineGeometry.ts` with frames in place of milliseconds.
 */

/** Minimum horizontal scale (very zoomed out). */
export const MIN_PX_PER_FRAME = 0.02;
/** Maximum horizontal scale (very zoomed in: 1 frame = 40px). */
export const MAX_PX_PER_FRAME = 40;
/** Default horizontal scale (2px per frame). */
export const DEFAULT_PX_PER_FRAME = 2;

/** Number of block color slots (--mdtraj-block-0 .. --mdtraj-block-5). */
export const BLOCK_COLOR_COUNT = 6;

/** Clamp a scale into the allowed range. */
export function clampPxPerFrame(v: number): number {
    if (!Number.isFinite(v)) return DEFAULT_PX_PER_FRAME;
    return Math.min(MAX_PX_PER_FRAME, Math.max(MIN_PX_PER_FRAME, v));
}

/** Horizontal pixel offset for a frame index at a given scale. */
export function frameToPx(frame: number, pxPerFrame: number): number {
    return frame * pxPerFrame;
}

/** Nearest frame index for a pixel offset (inverse of frameToPx), clamped. */
export function pxToFrame(px: number, pxPerFrame: number, nframe: number): number {
    if (pxPerFrame <= 0 || nframe <= 0) return 0;
    const f = Math.round(px / pxPerFrame);
    return Math.max(0, Math.min(f, nframe - 1));
}

/** "Nice" ruler tick steps (frames) in ascending order. */
const FRAME_STEPS = [
    1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000,
    50000, 100000,
];

/**
 * Choose a frame tick step so adjacent labels sit about `targetPx` apart.
 *
 * @param pxPerFrame - Current horizontal scale.
 * @param targetPx - Desired pixel spacing between major ticks.
 */
export function niceFrameStep(pxPerFrame: number, targetPx = 72): number {
    const wantFrames = targetPx / Math.max(pxPerFrame, 1e-9);
    for (const step of FRAME_STEPS) {
        if (step >= wantFrames) return step;
    }
    return FRAME_STEPS[FRAME_STEPS.length - 1];
}

/** Content width (px) for a track of `nframe` frames, with a sensible minimum. */
export function trackWidthPx(nframe: number, pxPerFrame: number, minPx = 320): number {
    return Math.max(minPx, Math.ceil(nframe * pxPerFrame) + 40);
}

/** Compute the scale that fits `nframe` frames into `availPx`. */
export function fitPxPerFrame(nframe: number, availPx: number): number {
    if (nframe <= 0 || availPx <= 0) return DEFAULT_PX_PER_FRAME;
    return clampPxPerFrame((availPx - 40) / nframe);
}

/** Color slot index (0 .. BLOCK_COLOR_COUNT-1) for a block position. */
export function blockColorIndex(index: number): number {
    return ((index % BLOCK_COLOR_COUNT) + BLOCK_COLOR_COUNT) % BLOCK_COLOR_COUNT;
}

/** File basename (last path segment) of a source path. */
export function basename(p: string): string {
    return p.split(/[\\/]/).pop() ?? p;
}
