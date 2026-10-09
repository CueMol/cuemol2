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
 *
 * Only one such action runs at a time. The callers do not share a queue (an
 * agent turn, the console panel, the command line and an MCP client each
 * start on their own), and a second one started inside the first's
 * transaction would have its edits committed or undone with the first's. So
 * each caller checks `txnBusy()` before it starts and refuses rather than
 * waits: an agent turn can sit on its transaction for minutes while the
 * model thinks, longer than any remote caller should hang.
 */

import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { validateSelection } from '@renderer/worker/server/services/select/validateSelection'
import type { AnyOp, OpContext, OpOutcome } from './op'
import type { ParamMap } from './params'

const log = console

/**
 * The first selection argument that does not compile, as an error; else null.
 *
 * Checked before the op runs, for every caller alike, so a typo is reported as
 * a typo before anything has changed. An empty one is left to the op, where it
 * means "none" or "everything".
 */
function invalidSelection(op: AnyOp, ctx: WorkerContext, args: Record<string, unknown>, sceneId: number): string | null {
  for (const [name, p] of Object.entries(op.params as ParamMap)) {
    const v = args[name]
    if (p.semantic !== 'selection' || typeof v !== 'string' || v.trim() === '') continue
    if (!validateSelection(ctx, { selStr: v, sceneId }).ok) return `${name}: "${v}" is not a valid selection.`
  }
  return null
}

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
  const badSel = invalidSelection(op, ctx, args, oc.sceneId)
  if (badSel) return { ok: false, error: badSel }
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

/** Transactions open now, from any caller. */
let openTxns = 0

/** Whether an action's transaction is open, so another must not start. */
export function txnBusy(): boolean {
  return openTxns > 0
}

/** What a caller refused by `txnBusy()` reports. */
export const TXN_BUSY_MESSAGE =
  'CueMol is busy: another command or agent turn is running. Try again when it has finished.'

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
  openTxns++
  try {
    return await body()
  } finally {
    openTxns--
    if (mutated()) scene.commitUndoTxn()
    else scene.rollbackUndoTxn()
  }
}

/**
 * Run `body` outside any transaction (an op whose `outsideTxn` holds), yet
 * as busy as one: no other command, call or turn may start until it ends,
 * since a scene save or open must not have edits land in the middle.
 */
export async function runExclusive<T>(body: () => Promise<T>): Promise<T> {
  openTxns++
  try {
    return await body()
  } finally {
    openTxns--
  }
}

/** A transaction label from what the user typed or asked: one line, bounded. */
export function txnLabel(prefix: string, text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return `${prefix}${flat.length > 40 ? `${flat.slice(0, 40)}...` : flat}`
}
