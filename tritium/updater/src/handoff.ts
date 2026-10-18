/**
 * @file handoff.ts
 * @description Files the old app, the swap helper and the new app pass between them.
 *
 * All live in the updater's work directory (under userData), which the old
 * and the new app share:
 *   - `pending.json`: written by the old app as it hands over; the new app
 *     writes the launch marker only when it is the version named there.
 *   - `launch-ok`: written by the new app once its main window is up.
 *   - `result.json`: the helper's outcome, reported and deleted by the next start.
 */

import path from 'node:path'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

/** The helper's outcome. */
export interface SwapResult {
  outcome: 'ok' | 'rolledBack' | 'failed' | 'aborted'
  from: string
  to: string
  detail: string
}

/** The fixed file names in `workDir`. */
export function handoffPaths(workDir: string) {
  return {
    pending: path.join(workDir, 'pending.json'),
    marker: path.join(workDir, 'launch-ok'),
    result: path.join(workDir, 'result.json'),
    log: path.join(workDir, 'swap.log'),
  }
}

/** Record that the app is handing over from `from` to `to`. */
export function writePending(workDir: string, from: string, to: string): void {
  writeFileSync(handoffPaths(workDir).pending, JSON.stringify({ from, to }))
}

/**
 * Tell a waiting helper that this app started. Does nothing unless a
 * handover to exactly `current` is pending, so an ordinary launch (or the
 * old app relaunched after a rollback) never writes a marker.
 *
 * @returns whether the marker was written
 */
export function markLaunched(workDir: string, current: string): boolean {
  const p = handoffPaths(workDir)
  try {
    const pending = JSON.parse(readFileSync(p.pending, 'utf8')) as { to?: string }
    if (pending.to !== current) return false
    writeFileSync(p.marker, current)
    return true
  } catch {
    return false
  }
}

/** Read and delete the helper's outcome, or null when there is none. */
export function takeSwapResult(workDir: string): SwapResult | null {
  const file = handoffPaths(workDir).result
  try {
    const r = JSON.parse(readFileSync(file, 'utf8')) as SwapResult
    return r
  } catch {
    return null
  } finally {
    rmSync(file, { force: true })
  }
}
