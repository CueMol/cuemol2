/**
 * @file components/panes/colorPane/targetKey.ts
 * @description Encoding for the coloring pane's target selector.
 *
 * The pane's `<select>` carries one string per row, but a target is a pair --
 * a kind (object or renderer) and a uid, which collide across kinds. These two
 * functions are the whole encoding, kept apart from the pane so the round trip
 * can be read and tested without mounting anything.
 */

import type { ColoringTargetKind } from '@renderer/worker/server/services/rendererColoring.service';

export type TargetKey = string
export const makeKey = (kind: ColoringTargetKind, id: number): TargetKey =>
    `${kind}:${id}`
export function parseTargetKey(
    key: string,
): { targetKind: ColoringTargetKind; id: number } | null {
    const sep = key.indexOf(':')
    if (sep < 0) return null
    const kind = key.slice(0, sep)
    const id = Number(key.slice(sep + 1))
    if (kind !== 'object' && kind !== 'renderer') return null
    if (Number.isNaN(id)) return null
    return { targetKind: kind, id }
}
