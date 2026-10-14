/**
 * @file worker/server/catalog/moveDest.ts
 * @description Where a move op puts an entry of a list: some places from
 * where it is now, a number, or one end.
 *
 * The GUI records every move with `by`, the places it went (negative is up),
 * so a step cut out of the History still means "two places up" in a list of
 * another length; `to` and `end` are for writing a move by hand.
 */

import { enumOf, integer, optional } from './params'

/** The destination arguments every move op takes; exactly one is given. */
export const MOVE_DEST_PARAMS = {
  by: optional(integer('Places to move from where it is now: negative is up, positive down. Stops at either end.')),
  to: optional(integer('The number it should have, from 1.')),
  end: optional(enumOf(['top', 'bottom'], 'Move it to the top or the bottom of the list.')),
}

export interface MoveDest {
  by: number | null
  to: number | null
  end: 'top' | 'bottom' | null
}

/**
 * The index (from 0) a move ends at, in a list of `count` with the entry at
 * `from` (from 0).
 *
 * @param first - the first index an entry may move to (a pinned row above it)
 * @param listCmd - the command whose numbers `to` uses
 * @returns the index, or why the destination is not one.
 */
export function moveTarget(dest: MoveDest, from: number, count: number, listCmd: string, first = 0): number | string {
  const given = [dest.by, dest.to, dest.end].filter((v) => v !== null).length
  if (given !== 1) return 'Give exactly one of by, to or end.'
  if (dest.end !== null) return dest.end === 'top' ? first : count - 1
  if (dest.by !== null) return Math.max(first, Math.min(count - 1, from + dest.by))
  const to = dest.to as number
  if (to < first + 1 || to > count) return `to must be ${first + 1} to ${count}, as ${listCmd} numbers them.`
  return to - 1
}

/** A destination as a History line says it: "2 places up", "to 3", "to the top". */
export function moveText(dest: MoveDest): string {
  if (dest.end !== null) return `to the ${dest.end}`
  if (dest.to !== null) return `to ${dest.to}`
  const n = dest.by ?? 0
  const places = Math.abs(n) === 1 ? 'place' : 'places'
  return `${Math.abs(n)} ${places} ${n < 0 ? 'up' : 'down'}`
}
