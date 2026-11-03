/**
 * @file runs.ts
 * @description Sending the runs of one command line under the edit lock.
 *
 * A command line that is several runs (a scene, then the files and `-c` that
 * go into it) holds the app's edit lock from before the first to after the
 * last, so that no other client edits or switches tabs in between
 * (local-api-server.md, edit lock). A single run needs no explicit lock: the
 * app takes one for the run itself.
 */

import { randomUUID } from 'node:crypto'
import type { Submission } from './inputs'

/** What `post` reports for an app without `/console/lock` (404). */
export const LOCK_UNSUPPORTED = 'This CueMol has no edit lock.'

/** `/console/lock`; `acquire` rejects when another client holds the lock. */
export interface LockApi {
  acquire(owner: string): Promise<'held' | 'unsupported'>
  release(owner: string): Promise<void>
}

/**
 * Send `subs` in order through `runOne`, stopping at the first that fails.
 *
 * @returns whether every run ran
 */
export async function sendRuns(
  subs: readonly Submission[],
  runOne: (s: Submission, lock?: string) => Promise<boolean>,
  lockApi: LockApi,
  owner: string = randomUUID(),
): Promise<boolean> {
  if (subs.length <= 1) return subs.length === 0 || runOne(subs[0])
  const held = (await lockApi.acquire(owner)) === 'held'
  try {
    for (const s of subs) {
      if (!(await runOne(s, held ? owner : undefined))) return false
    }
    return true
  } finally {
    if (held) await lockApi.release(owner)
  }
}
