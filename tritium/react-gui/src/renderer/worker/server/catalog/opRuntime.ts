/**
 * @file worker/server/catalog/opRuntime.ts
 * @description The one way an op is run, and the undo transaction its
 * callers run ops inside.
 *
 * Every caller -- an agent turn, a console submission -- goes through
 * `invokeOp`, so what is true of running an op (a throw becomes a failure; a
 * successful mutating op marks the transaction as changed) is true for all of
 * them, and there is one place to add whatever later has to see every op that
 * runs.
 *
 * The transaction rule is shared for the same reason. A caller opens one
 * transaction for a unit the user thinks of as one action (an agent turn, a
 * console submission) and:
 *
 * - commits it when anything changed, even when a later op failed or the run
 *   was stopped. C++ `rollbackTxn` really reverts, so rolling back would undo
 *   edits the user has already watched appear.
 * - rolls it back when nothing changed. Committing an empty transaction
 *   clears the redo stack, so a read-only action would silently cost the user
 *   their redo.
 */

import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { AnyOp, OpContext, OpOutcome } from './op'

const log = console

/**
 * Run one op.
 *
 * Never throws: an op that throws is reported as a failure, because a throw
 * must not take its caller's transaction with it.
 *
 * @param args - already read into the op's parameter types (`readToolArgs`,
 *   or a console's binder).
 */
export async function invokeOp(
  op: AnyOp,
  ctx: WorkerContext,
  args: Record<string, unknown>,
  oc: OpContext,
): Promise<OpOutcome> {
  let outcome: OpOutcome
  try {
    outcome = await op.run(ctx, args, oc)
  } catch (e) {
    log.warn(`[worker] op ${op.name} threw:`, e)
    outcome = { ok: false, error: e instanceof Error ? e.message : `${op.name} failed.` }
  }
  if (outcome.ok && op.mutates) oc.markMutated()
  return outcome
}

/**
 * Run `body` inside one undo transaction, then commit or roll back by the
 * rule above.
 *
 * @param mutated - read after `body` settles (or throws): whether anything
 *   was changed. The caller owns the flag because it is also what it reports.
 */
export async function runInTxn<T>(
  scene: Scene,
  label: string,
  mutated: () => boolean,
  body: () => Promise<T>,
): Promise<T> {
  scene.startUndoTxn(label)
  try {
    return await body()
  } finally {
    if (mutated()) scene.commitUndoTxn()
    else scene.rollbackUndoTxn()
  }
}

/** A transaction label from what the user typed or asked: one line, bounded. */
export function txnLabel(prefix: string, text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return `${prefix}${flat.length > 40 ? `${flat.slice(0, 40)}...` : flat}`
}
