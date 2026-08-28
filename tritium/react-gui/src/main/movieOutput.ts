/**
 * @file main/movieOutput.ts
 * @description App-managed output folder for movie renders, and its sweep.
 *
 * A still render needs no setup -- it lands in a temp work dir and the user
 * saves it if they want it. A movie render used to demand an output folder up
 * front, which made every animation render a configuration exercise. This
 * module supplies the default: one folder per app run under the OS temp dir,
 * which the user can override by picking their own.
 *
 * Lifetime (see ADR-0043). Frame images and the encoded movie are worth very
 * different amounts: the frames are bulky and only useful for re-encoding,
 * while the movie is the small deliverable that may have cost hours. So:
 *
 *   - nothing is deleted while the app runs (the frame slider and Re-encode
 *     read the frames back), and nothing is deleted on quit either -- unlike
 *     the render history, a movie is not cheap to reproduce;
 *   - the next start sweeps: frames older than a day go, a session's whole
 *     folder goes once its movie is a month old or it falls out of the newest
 *     MOVIE_SESSION_LIMIT sessions;
 *   - a folder the user picked is never touched by any of this.
 *
 * A concurrently running instance is identified through the session metadata's
 * pid and skipped, so one instance's sweep cannot delete another's frames
 * mid-render.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ANY_FRAME_FILE_RE, MOVIE_FILE_EXTENSIONS } from '@shared/movieFrames'

/** Fixed parent, so a previous run's session folders are found on restart. */
const MOVIE_ROOT = path.join(os.tmpdir(), 'cuemol-movies')

/** Session folder name prefix (the rest is mkdtemp's random suffix). */
const SESSION_PREFIX = 'session-'

/** Per-session marker holding the owning pid. */
const SESSION_META = '.cuemol-session.json'

/** How long a frame image survives after it was written. */
export const FRAME_TTL_MS = 24 * 60 * 60 * 1000

/** How long an encoded movie survives after it was written. */
export const MOVIE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** How many past sessions holding a movie are kept, newest first. */
export const MOVIE_SESSION_LIMIT = 10

/** This run's session folder, created on first ask. */
let sessionDir: string | null = null

/** Whether a file name is an encoded movie (any format). */
function isMovieFile(name: string): boolean {
  return MOVIE_FILE_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/**
 * The app-managed output folder for this run, created on first ask.
 *
 * Memoised: every movie render of a run shares one folder, exactly as picking
 * a folder once would. Returns an empty string when the folder cannot be
 * created, which leaves the user to pick one rather than failing the window.
 */
export function getSessionMovieDir(): string {
  if (sessionDir !== null && fs.existsSync(sessionDir)) return sessionDir
  try {
    fs.mkdirSync(MOVIE_ROOT, { recursive: true })
    const dir = fs.mkdtempSync(path.join(MOVIE_ROOT, SESSION_PREFIX))
    try {
      fs.writeFileSync(
        path.join(dir, SESSION_META),
        JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
      )
    } catch {
      // Losing the marker only costs this folder its protection from another
      // instance's sweep; the folder itself is usable.
    }
    sessionDir = dir
    return dir
  } catch {
    return ''
  }
}

/** The pid recorded in a session folder, or null when there is no usable one. */
function readSessionPid(dir: string): number | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, SESSION_META), 'utf8'))
    const pid = (parsed as { pid?: unknown }).pid
    return typeof pid === 'number' && Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

/**
 * Whether a process is still running. EPERM means it exists but belongs to
 * another user -- alive as far as this check is concerned.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Files directly in a directory with their mtimes; empty when unreadable. */
function readEntries(dir: string): { name: string; mtimeMs: number }[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const out: { name: string; mtimeMs: number }[] = []
  for (const name of names) {
    try {
      const st = fs.statSync(path.join(dir, name))
      if (st.isFile()) out.push({ name, mtimeMs: st.mtimeMs })
    } catch {
      /* vanished between readdir and stat */
    }
  }
  return out
}

/** Remove a file, reporting whether it went. */
function removeFile(file: string): boolean {
  try {
    fs.rmSync(file, { force: true })
    return true
  } catch {
    return false
  }
}

/** Remove a directory and everything under it, reporting whether it went. */
function removeDir(dir: string): boolean {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

/**
 * Apply the lifetime rules to every session folder under `root`.
 *
 * Ages come from each file's own mtime rather than the folder's, so deleting a
 * folder's stale frames does not reset the clock on the movie it holds.
 *
 * @param root - parent of the session folders (MOVIE_ROOT in production)
 * @param now - reference time, injectable so tests need not wait
 * @returns counts of what was removed
 */
export function sweepMovieSessions(
  root: string,
  now: number = Date.now(),
): { removedFrames: number; removedDirs: number } {
  let names: string[]
  try {
    names = fs.readdirSync(root)
  } catch {
    // No root yet (first ever run) -- nothing to sweep.
    return { removedFrames: 0, removedDirs: 0 }
  }

  let removedFrames = 0
  let removedDirs = 0
  /** Sessions that still hold a movie and survived the age rules. */
  const withMovie: { dir: string; movieMtimeMs: number }[] = []

  for (const name of names) {
    if (!name.startsWith(SESSION_PREFIX)) continue
    const dir = path.join(root, name)
    try {
      if (!fs.statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    // Never sweep this run's own folder, nor a folder another live instance
    // may be writing into right now.
    if (sessionDir !== null && path.resolve(dir) === path.resolve(sessionDir)) continue
    const pid = readSessionPid(dir)
    if (pid !== null && isPidAlive(pid)) continue

    const entries = readEntries(dir)
    for (const e of entries) {
      if (!ANY_FRAME_FILE_RE.test(e.name)) continue
      if (now - e.mtimeMs <= FRAME_TTL_MS) continue
      if (removeFile(path.join(dir, e.name))) removedFrames++
    }

    const movies = entries.filter((e) => isMovieFile(e.name))
    if (movies.length === 0) {
      // Nothing worth keeping: drop the folder once its newest content --
      // remaining frames, or just the session marker -- is past the frame TTL.
      const newest = entries.reduce((m, e) => Math.max(m, e.mtimeMs), 0)
      if (now - newest > FRAME_TTL_MS && removeDir(dir)) removedDirs++
      continue
    }

    const movieMtimeMs = movies.reduce((m, e) => Math.max(m, e.mtimeMs), 0)
    if (now - movieMtimeMs > MOVIE_TTL_MS) {
      if (removeDir(dir)) removedDirs++
      continue
    }
    withMovie.push({ dir, movieMtimeMs })
  }

  // Past the age rules, keep only the newest sessions so a burst of renders
  // cannot fill the temp dir for a month.
  withMovie.sort((a, b) => b.movieMtimeMs - a.movieMtimeMs)
  for (const s of withMovie.slice(MOVIE_SESSION_LIMIT)) {
    if (removeDir(s.dir)) removedDirs++
  }

  return { removedFrames, removedDirs }
}

/**
 * Sweep the app-managed movie folders. Called once at startup -- deliberately
 * not on quit, so a render finished just before closing the app is still there
 * the next morning.
 */
export function sweepMovieOutputs(): void {
  const { removedFrames, removedDirs } = sweepMovieSessions(MOVIE_ROOT)
  if (removedFrames > 0 || removedDirs > 0) {
    // Silent otherwise, but not invisible: the only other trace is disk space.
    console.log(
      `[Main] movie output sweep: removed ${removedFrames} frame(s), ${removedDirs} folder(s)`,
    )
  }
}
