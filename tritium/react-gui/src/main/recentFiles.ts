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

import fs from 'fs'
import type { RecentFileEntry } from '@shared/ipcTypes'
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
export function getExistingRecents(): RecentFileEntry[] {
  return getRecents().filter((e) => {
    try {
      return fs.existsSync(e.path)
    } catch {
      return false
    }
  })
}
