/**
 * @file worker/shared/numbered.ts
 * @description Lists that commands number from 1, and naming one of their
 * entries by its number, `#uid` or name.
 *
 * A list a command prints (scenes, cameras, paint entries, animation
 * elements, morph frames) numbers its entries from 1, and the command that
 * acts on one takes that number. Shared by the worker's ops and the window's
 * scene commands, so every list counts and complains the same way.
 */

/** The entries with their number from 1, as a list command returns them. */
export function numbered<T extends object>(list: readonly T[]): (T & { number: number })[] {
  return list.map((e, i) => ({ number: i + 1, ...e }))
}

/** The entry numbered `n` in `list`, or why there is none. */
export function pickByNumber<T>(list: readonly T[], n: number, noun: string, listCmd: string): T | string {
  return list[n - 1] ?? `There is no ${noun} ${n}; ${listCmd} numbers them 1 to ${list.length}.`
}

/** Null when `to` is a number `listCmd` shows (1 to `count`), else why not. */
export function checkPosition(to: number, count: number, listCmd: string): string | null {
  return to >= 1 && to <= count ? null : `The position must be 1 to ${count}, as ${listCmd} numbers them.`
}

/** How `findBySpec` reads an entry. */
export interface SpecKeys<T> {
  uid: (e: T) => number
  name: (e: T) => string
  /** What an entry is called in a message: "scene", "animation element". */
  noun: string
  /** The command that lists them, for its numbers. */
  listCmd: string
}

/**
 * The entry `spec` names: its number from 1, `#uid`, or its name (which must
 * be unique).
 *
 * @returns the entry, or why `spec` names none.
 */
export function findBySpec<T>(list: readonly T[], spec: string, keys: SpecKeys<T>): T | string {
  const s = spec.trim()
  const uid = /^#(\d+)$/.exec(s)
  if (uid) return list.find((e) => keys.uid(e) === Number(uid[1])) ?? `No ${keys.noun} has uid ${s}.`
  if (/^\d+$/.test(s)) return pickByNumber(list, Number(s), keys.noun, keys.listCmd)
  const named = list.filter((e) => keys.name(e) === s)
  if (named.length === 1) return named[0]
  if (named.length > 1) return `${named.length} ${keys.noun}s are named "${s}"; give its number or #uid.`
  return `No ${keys.noun} is named "${s}".`
}
