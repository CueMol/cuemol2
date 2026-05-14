/**
 * Pure list-manipulation helpers for the Open Recent (MRU) list.
 *
 * Kept in shared/ so renderer-side tests can exercise the dedup and cap
 * semantics without importing main-only modules (electron-store, fs).
 * The main-side recentFiles module wraps these with persistence and an
 * fs.existsSync filter.
 */

import type { RecentFileEntry } from './ipcTypes'

export const MAX_RECENTS = 10

/**
 * Insert (or promote) an entry at the head of the MRU list. Dedup uses
 * the path string only. Returns a new array; the input list is not
 * mutated.
 */
export function addToRecents(
    current: RecentFileEntry[],
    entry: RecentFileEntry,
    max: number = MAX_RECENTS,
): RecentFileEntry[] {
    if (!entry.path) return current.slice()
    const next = current.filter((e) => e.path !== entry.path)
    next.unshift({ path: entry.path, ftype: entry.ftype })
    if (next.length > max) next.length = max
    return next
}
