/**
 * @file features/coloring/section/gradientStops.ts
 * @description The section's stop shape and the colour it shows for one.
 *
 * A stop carries two colours for one reason: `color` is the CueMol string the
 * renderer stores (which may be a name), `hex` is what the swatch draws. They
 * diverge only between an optimistic edit and the refetch that replaces it,
 * which is what `resolveDisplayHex` covers -- a best-effort read of the name
 * so the swatch does not blank out for the frame in between.
 */

import type { GradientStop } from '@renderer/h3-kit/gradient';
import type { MultiGradWriteNode } from '@renderer/worker/server/services/coloring/coloring.service';

/** Stop displayed by this section: bar geometry + the CueMol color string. */
export interface MultiGradStop extends GradientStop {
    /** CueMol color string (may be a named color); hex is display-only. */
    color?: string
}

/** Convert display stops back to the service write shape. */
export function toWriteNodes(stops: readonly MultiGradStop[]): MultiGradWriteNode[] {
    return stops.map((s) => ({ value: s.value, color: s.color ?? s.hex }))
}

/** Basic named colors for optimistic swatch display (preset colors etc.). */
const NAMED_HEX: Record<string, string> = {
    red: '#FF0000', yellow: '#FFFF00', white: '#FFFFFF',
    green: '#00FF00', blue: '#0000FF', black: '#000000',
    cyan: '#00FFFF', magenta: '#FF00FF', orange: '#FFA500',
}

/**
 * Best-effort display hex for a CueMol color string, used only for the
 * optimistic override; the canonical hex from C++ replaces it on refetch.
 */
export function resolveDisplayHex(color: string, fallback: string): string {
    const c = color.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toUpperCase()
    if (/^#[0-9a-fA-F]{3}$/.test(c)) {
        return (
            '#' + c.slice(1).split('').map((ch) => ch + ch).join('')
        ).toUpperCase()
    }
    return NAMED_HEX[c.toLowerCase()] ?? fallback
}

/** Span factor per - / + click. */
export const ZOOM_STEP = 1.5
/** Fraction of the current span shifted per < / > click. */
export const PAN_STEP = 0.25

/** Drop a stuck optimistic override after this long without a refetch. */
export const PENDING_SAFETY_MS = 1500
