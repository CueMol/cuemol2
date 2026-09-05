/**
 * @file worker/shared/renderSettingsValues.ts
 * @description Comparing the flat render settings a scene stores.
 *
 * Both threads compare these maps: the worker to skip keys a write would
 * not change (every C++ property write is an undo record, even a no-op), the
 * Rendering window to tell its own write's echo from a real change. Reals
 * cross the C++ boundary as doubles but are text in the scene file, so the
 * comparison is tolerant.
 */

import type { RenderSettingsValues } from '@shared/types/renderWindow'

export type { RenderSettingsValues }

/** Relative tolerance for real-valued settings. */
export const RENDER_VALUE_EPS = 1e-6

/** Whether two setting values are the same (numbers within RENDER_VALUE_EPS). */
export function sameRenderValue(a: unknown, b: unknown): boolean {
    if (typeof a === 'number' && typeof b === 'number') {
        if (a === b) return true
        const scale = Math.max(Math.abs(a), Math.abs(b), 1)
        return Math.abs(a - b) <= RENDER_VALUE_EPS * scale
    }
    return a === b
}

/**
 * Whether every key of `keys` (default: the keys of `b`) holds the same
 * value in `a` and `b`. A key missing from either side counts as different.
 */
export function sameRenderValues(
    a: RenderSettingsValues,
    b: RenderSettingsValues,
    keys: readonly string[] = Object.keys(b),
): boolean {
    for (const k of keys) {
        if (!(k in a) || !(k in b)) return false
        if (!sameRenderValue(a[k], b[k])) return false
    }
    return true
}
