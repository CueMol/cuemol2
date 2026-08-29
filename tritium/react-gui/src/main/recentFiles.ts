/**
 * Main-process Most Recently Used (MRU) file list.
 *
 * Mirrors UXP `uxp_gui/cuemol2/components/jsmods/cuemol2ui-lib/mru-files.js`:
 * fixed-size LRU keyed by absolute path, newest first, capped at
 * MAX_RECENTS. Adding an existing path moves it to the front.
 *
 * Persistence is delegated to electron-store (`stateStore.ts`); reads on
 * each public function so callers see the latest on-disk state even if a
 * second window mutated the store.
 */

import { promises as fsp } from 'fs'
import type { RecentFileEntry } from '@shared/types/recent'
import { addToRecents, MAX_RECENTS } from '@shared/recentFilesLogic'
import { loadRecentFiles, saveRecentFiles } from './stateStore'

export { MAX_RECENTS }

export function getRecents(): RecentFileEntry[] {
  return loadRecentFiles()
}

/**
 * Insert (or promote) a single entry at the head of the MRU list.
 *
 * Dedup uses the path string only (UXP behavior). Re-opening a file as
 * `obj` after a previous `scene` entry, or vice versa, replaces the
 * existing ftype -- last write wins. Returns the new list.
 */
export function addRecent(entry: RecentFileEntry): RecentFileEntry[] {
  const next = addToRecents(getRecents(), entry)
  saveRecentFiles(next)
  return next
}

export function clearRecents(): RecentFileEntry[] {
  saveRecentFiles([])
  return []
}

/**
 * MRU filtered to entries whose file still exists on disk. Used at menu
 * build time so we don't show stale items, but the stored list itself is
 * not pruned -- a transiently unmounted volume must not cause permanent
 * loss of history.
 */
/**
 * Paths last seen as missing. Everything not in here is treated as present.
 *
 * The menu is rebuilt on startup and on every RECENT_ADD / RECENT_CLEAR, and
 * this used to stat each entry synchronously on the main thread. One MRU path
 * on a disconnected SMB / NFS mount then blocked every window's IPC and input
 * for the mount timeout -- tens of seconds. The check runs off the menu path
 * now; the worst case is one stale entry shown until the refresh lands.
 */
const missingPaths = new Set<string>()

/** Recent entries minus the ones the last refresh found missing. */
export function getExistingRecents(): RecentFileEntry[] {
  return getRecents().filter((e) => !missingPaths.has(e.path))
}

/**
 * Re-check which recent paths still exist, off the main thread's critical path.
 *
 * @param onChange - called when the missing set actually changed, so the caller
 *   can rebuild the menu.
 */
export async function refreshRecentsExistence(onChange?: () => void): Promise<void> {
  const before = new Set(missingPaths)
  const entries = getRecents()
  const results = await Promise.all(
    entries.map(async (e) => {
      try {
        await fsp.access(e.path)
        return [e.path, true] as const
      } catch {
        return [e.path, false] as const
      }
    }),
  )
  missingPaths.clear()
  for (const [p, exists] of results) if (!exists) missingPaths.add(p)

  const changed =
    before.size !== missingPaths.size || [...missingPaths].some((p) => !before.has(p))
  if (changed) onChange?.()
}
