/**
 * @file plugins/pymconsole/worker/runControl.ts
 * @description Stopping a submission that is still running.
 *
 * A submission is one `runCommand` call, which the worker works through
 * command by command. Stop sets a flag the loop checks before each command,
 * and cancels any download a command is waiting on -- the flag alone would
 * only take effect once that download had finished.
 *
 * What already ran is kept: the loop stops the way it does on an error, and
 * the transaction is committed if anything changed, for the same reason
 * (`runCommand.ts`).
 */

import { cancelStream } from '@renderer/worker/server/services/helpers/streamFetchToReader'
import { ok } from '@renderer/worker/shared/result'
import type { Result } from '@renderer/worker/shared/result'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CancelRunArgs } from '../shared/consoleTypes'

interface RunState {
  stopped: boolean
  /** Downloads in flight, by stream request id. */
  streams: Set<string>
}

const runs = new Map<string, RunState>()

/** Start tracking a run. */
export function beginRun(runId: string): void {
  runs.set(runId, { stopped: false, streams: new Set() })
}

/** Stop tracking a run, once it has returned. */
export function endRun(runId: string): void {
  runs.delete(runId)
}

/** Whether Stop was pressed for this run. */
export function isStopped(runId: string): boolean {
  return runs.get(runId)?.stopped ?? false
}

/** Remember a download so Stop can cancel it. */
export function noteRunStream(runId: string, reqId: string): void {
  runs.get(runId)?.streams.add(reqId)
}

/**
 * Stop a run: no further command starts, and a download in progress is
 * cancelled (the command waiting on it then fails as `canceled`).
 *
 * A run that has already finished is not an error; Stop can race the end.
 */
export function cancelRun(_ctx: WorkerContext, args: CancelRunArgs): Result {
  const run = runs.get(args.runId)
  if (!run) return ok()
  run.stopped = true
  for (const reqId of run.streams) cancelStream(reqId)
  return ok()
}
