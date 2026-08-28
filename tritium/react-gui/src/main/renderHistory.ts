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

/** Fixed root, so a crashed run's leftovers are found on restart. */
const HISTORY_ROOT = path.join(os.tmpdir(), 'cuemol-render-history')

/** Prefix of a per-run directory under {@link HISTORY_ROOT}. */
const RUN_PREFIX = 'run-'

/**
 * This run's own directory.
 *
 * The root is a fixed path under os.tmpdir() shared by every instance, and
 * CUEMOL_FRESH_PREFS deliberately gives a second instance its own
 * single-instance lock domain -- so two instances really do run at once. When
 * they shared one directory, the second one's boot sweep deleted the first
 * one's archived images and rm -rf'd its live work directories.
 *
 * Ownership cannot be expressed with a marker file inside a shared directory:
 * whichever instance writes last owns it, and the marker only existed at all
 * once a work directory had been registered. Giving each run its own directory
 * makes the separation structural -- no instance can reach another's files --
 * which is the same shape movieOutput.ts uses for movie sessions.
 */
const RUN_DIR = path.join(HISTORY_ROOT, `${RUN_PREFIX}${process.pid}`)

/**
 * Index of the work directories this run registered, kept beside its archived
 * images. The directories have random names and live elsewhere under the temp
 * dir, so a run that dies without reaching its cleanup would otherwise leave
 * them unidentifiable; a later start reads this file out of the dead run's
 * directory and removes exactly those.
 */
const WORKDIR_INDEX = path.join(RUN_DIR, 'workdirs.json')

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

/** Create this run's history directory, returning false when it cannot be used. */
function ensureDir(): boolean {
  try {
    fs.mkdirSync(RUN_DIR, { recursive: true })
    return true
  } catch {
    return false
  }
}

/**
 * Whether a process is still running. EPERM means it exists but belongs to
 * another user -- alive as far as this check is concerned. Mirrors the guard
 * movieOutput.ts uses for the same reason.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Remove this run's own history: its archived images and the work directories
 * it registered.
 *
 * Called on quit, and when the user clears the history from the Rendering
 * window. Only ever touches this run's directory, so a second instance running
 * at the same time is unaffected.
 */
export function clearRenderHistory(): void {
  clearRenderWorkDirs()
  archived = []
  try {
    fs.rmSync(RUN_DIR, { recursive: true, force: true })
  } catch {
    /* a locked or already-removed directory is not worth failing over */
  }
}

/**
 * Remove what previous runs left behind, at boot.
 *
 * Only directories belonging to a process that is no longer running are
 * touched: another instance may be live right now (CUEMOL_FRESH_PREFS gives it
 * its own lock domain), and its images and in-flight work directories must
 * survive. Each dead run's work directories are read out of its own index and
 * removed before its directory goes -- they live elsewhere under the temp dir
 * and would otherwise be unidentifiable.
 */
export function sweepStaleRenderHistory(): void {
  let names: string[]
  try {
    names = fs.readdirSync(HISTORY_ROOT)
  } catch {
    return // nothing has ever been written
  }

  let removed = 0
  for (const name of names) {
    if (!name.startsWith(RUN_PREFIX)) continue
    const pid = Number.parseInt(name.slice(RUN_PREFIX.length), 10)
    if (!Number.isInteger(pid) || pid <= 0) continue
    if (pid === process.pid) continue
    if (isPidAlive(pid)) continue

    const dir = path.join(HISTORY_ROOT, name)
    for (const workDir of readWorkDirIndex(path.join(dir, 'workdirs.json'))) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      removed++
    } catch {
      /* ignore */
    }
  }
  if (removed > 0) {
    const plural = removed === 1 ? '' : 's'
    console.log(`[Main] render history: removed ${removed} stale run director${plural ? 'ies' : 'y'}`)
  }
}

/**
 * Work directories recorded in one run's index file.
 *
 * Ownership is the directory the file sits in, not anything inside it, so the
 * bare-array format an older build wrote reads back unchanged.
 *
 * @param file - index path; a dead run's during the boot sweep, ours otherwise.
 */
function readWorkDirIndex(file: string): string[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    const list = Array.isArray(parsed) ? parsed : (parsed as { dirs?: unknown }).dirs
    return Array.isArray(list) ? list.filter((d): d is string => typeof d === 'string') : []
  } catch {
    return []
  }
}

/** Persist the current list so a crashed run's directories stay identifiable. */
function writeWorkDirIndex(): void {
  if (!ensureDir()) return
  try {
    fs.writeFileSync(WORKDIR_INDEX, JSON.stringify({ pid: process.pid, dirs: workDirs }))
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
  const dest = path.join(RUN_DIR, renderHistoryFileName(resultId))
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
      fs.rmSync(path.join(RUN_DIR, renderHistoryFileName(evicted)), { force: true })
    } catch {
      /* ignore */
    }
  }
  return true
}

/** Where an archived render lives, whether or not it is still there. */
export function renderImagePath(resultId: string): string {
  return path.join(RUN_DIR, renderHistoryFileName(resultId))
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
