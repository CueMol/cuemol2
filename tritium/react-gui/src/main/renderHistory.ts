/**
 * @file main/renderHistory.ts
 * @description On-disk store for the Rendering window's render history.
 *
 * A finished render is already a PNG on disk (the worker's temp work dir), and
 * the only thing that needs it in memory is whichever entry is on screen. So
 * the image never travels as a data URL: the main window archives the file
 * here by result id, and the render window reads back the one it shows.
 *
 * The store is a directory under the OS temp dir, wiped when the app quits and
 * again on the next start (a crash leaves it behind). Archiving evicts the
 * oldest entries past RENDER_HISTORY_LIMIT, so the directory stays bounded
 * without anyone tracking sizes.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { RENDER_HISTORY_LIMIT, renderHistoryFileName } from '@shared/renderHistory'

/** Fixed directory name, so a crashed run's leftovers are found on restart. */
const HISTORY_DIR = path.join(os.tmpdir(), 'cuemol-render-history')

/**
 * Index of the work directories this run registered, kept beside the archived
 * images. The directories have random names, so a run that dies without
 * reaching its cleanup would otherwise leave them unidentifiable; the next
 * start reads this file and removes exactly those. Sweeping the temp dir by
 * name pattern instead would risk deleting a second instance's in-flight
 * directory.
 */
const WORKDIR_INDEX = path.join(HISTORY_DIR, 'workdirs.json')

/** Archived ids, oldest first -- the eviction order. */
let archived: string[] = []

/**
 * Work directories this run's renders left behind. The worker keeps a still
 * render's directory after the job (its .pov / .inc are worth inspecting while
 * the app is up), which used to mean one directory per render accumulating in
 * the temp dir forever. They are registered as their image is archived and
 * dropped with the history -- on quit, or when the user clears it.
 *
 * Only directories the worker reports are touched: a movie's frames live in
 * the user's own output folder and are never registered.
 */
let workDirs: string[] = []

/** Create the history directory, returning false when it cannot be used. */
function ensureDir(): boolean {
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true })
    return true
  } catch {
    return false
  }
}

/**
 * Remove the whole store. Called at startup (clearing a crashed run's images)
 * and on quit; the history is deliberately not kept across app runs, since the
 * settings that produced each render are not either.
 */
export function clearRenderHistory(): void {
  // Adopt a previous run's directories: the on-disk index outlived the
  // in-memory list when that run crashed. Done silently -- the images they
  // hold are unreachable (the history metadata died with that run), so there
  // is nothing for a user to decide.
  for (const dir of readWorkDirIndex()) registerRenderWorkDir(dir)
  clearRenderWorkDirs()
  archived = []
  try {
    fs.rmSync(HISTORY_DIR, { recursive: true, force: true })
  } catch {
    /* a locked or already-removed directory is not worth failing over */
  }
}

/** Work directories recorded on disk, or none when there is no usable index. */
function readWorkDirIndex(): string[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(WORKDIR_INDEX, 'utf8'))
    return Array.isArray(parsed)
      ? parsed.filter((d): d is string => typeof d === 'string')
      : []
  } catch {
    return []
  }
}

/** Persist the current list so a crashed run's directories stay identifiable. */
function writeWorkDirIndex(): void {
  if (!ensureDir()) return
  try {
    fs.writeFileSync(WORKDIR_INDEX, JSON.stringify(workDirs))
  } catch {
    /* losing the index only costs the next start's cleanup */
  }
}

/**
 * Remember a finished render's work directory so it can be cleaned up later.
 * Ignores anything outside the temp dir, so a mis-reported path cannot turn
 * the cleanup into a delete of the user's own files.
 */
export function registerRenderWorkDir(dir: string): void {
  if (!dir) return
  const resolved = path.resolve(dir)
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) return
  if (workDirs.includes(resolved)) return
  workDirs.push(resolved)
  writeWorkDirIndex()
}

/** Delete the registered work directories. */
export function clearRenderWorkDirs(): void {
  let removed = 0
  for (const dir of workDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      removed++
    } catch {
      /* ignore */
    }
  }
  if (removed > 0) {
    // Silent, but not invisible: the only other trace is the disk space.
    const plural = removed === 1 ? 'y' : 'ies'
    console.log(`[Main] render history: removed ${removed} work director${plural}`)
  }
  workDirs = []
  try {
    fs.rmSync(WORKDIR_INDEX, { force: true })
  } catch {
    /* ignore */
  }
}

/**
 * Copy a finished render's PNG into the store under `resultId`.
 *
 * The source is the worker's own output file, which it keeps for inspection,
 * so this copies rather than moves.
 *
 * @returns whether the image can now be read back by that id.
 */
export function storeRenderImage(resultId: string, sourcePath: string): boolean {
  if (!resultId || !sourcePath || !ensureDir()) return false
  const dest = path.join(HISTORY_DIR, renderHistoryFileName(resultId))
  try {
    fs.copyFileSync(sourcePath, dest)
  } catch {
    return false
  }
  // Re-archiving an id (a re-sync, or a retry that reused it) keeps one entry.
  archived = archived.filter((id) => id !== resultId)
  archived.push(resultId)
  while (archived.length > RENDER_HISTORY_LIMIT) {
    const evicted = archived.shift()
    if (evicted === undefined) break
    try {
      fs.rmSync(path.join(HISTORY_DIR, renderHistoryFileName(evicted)), { force: true })
    } catch {
      /* ignore */
    }
  }
  return true
}

/** Where an archived render lives, whether or not it is still there. */
export function renderImagePath(resultId: string): string {
  return path.join(HISTORY_DIR, renderHistoryFileName(resultId))
}

/**
 * Read an archived render back as a data URL, or null when it is gone (evicted
 * past the limit, or lost with a crashed run's directory).
 */
export function readRenderImage(resultId: string): string | null {
  if (!resultId) return null
  try {
    const buf = fs.readFileSync(renderImagePath(resultId))
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
