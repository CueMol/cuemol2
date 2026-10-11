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
import { asOneOp, insideOp, noteEntry, txnBegin, txnEnd, txnOpen } from '@renderer/worker/server/actions/actionLog'
import type { ActionSource } from '@renderer/worker/server/actions/actionLog'
import type { AnyOp, OpContext, OpOutcome } from './op'
import type { ParamMap } from './params'
import { nodePath, sceneNodes } from './refs'

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

/** The semantic kinds whose value is a node uid. */
const REF_SEMANTICS = new Set(['object', 'molecule', 'renderer', 'node'])

/**
 * The path of each node argument, read before the op runs: a delete or a
 * rename would leave nothing (or another name) to read afterwards.
 */
function refPaths(op: AnyOp, ctx: WorkerContext, args: Record<string, unknown>, sceneId: number): Record<string, string> {
  const params = op.params as ParamMap
  const wanted = Object.keys(params).filter((n) => REF_SEMANTICS.has(params[n].semantic ?? '') && typeof args[n] === 'number')
  if (wanted.length === 0) return {}
  let nodes: ReturnType<typeof sceneNodes>
  try {
    nodes = sceneNodes(ctx, sceneId)
  } catch {
    return {}
  }
  const out: Record<string, string> = {}
  for (const name of wanted) {
    const node = nodes.find((n) => n.id === args[name])
    if (!node) continue
    // A name another node shares would not find this one again.
    const path = nodePath(node)
    if (nodes.filter((n) => nodePath(n) === path).length === 1) out[name] = path
  }
  return out
}

/** Whether a successful call belongs in the action log. */
function recordable(op: AnyOp, args: Record<string, unknown>, mutated: boolean): boolean {
  if (op.mutates || mutated) return true
  return typeof op.replay === 'function' ? op.replay(args) : op.replay === true
}

/**
 * Run one op.
 *
 * Never throws: an op that throws is reported as a failure, because a throw
 * must not take its caller's transaction with it.
 *
 * A successful op that changed something is added to the action log of the
 * transaction it ran in (`actions/actionLog.ts`); the services it calls do
 * not add themselves as well.
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
  // An op run by another op is part of that one, which is what is recorded.
  const logged = txnOpen(oc.sceneId) && !insideOp(oc.sceneId)
  const refs = logged ? refPaths(op, ctx, args, oc.sceneId) : {}
  let mutated = false
  const watched: OpContext = { ...oc, markMutated: () => { mutated = true; oc.markMutated() } }
  let outcome: OpOutcome
  try {
    outcome = await asOneOp(oc.sceneId, async () => op.run(ctx, args, watched))
  } catch (e) {
    log.warn(`[worker] op ${op.name} threw:`, e)
    outcome = { ok: false, error: e instanceof Error ? e.message : `${op.name} failed.` }
  }
  if (outcome.ok && op.mutates) oc.markMutated()
  if (outcome.ok && logged && recordable(op, args, mutated)) {
    noteEntry(oc.sceneId, { kind: 'op', op: op.name, args: { ...args }, refs })
  }
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
 * @param source - who asked, for the action log's row.
 */
export async function runInTxn<T>(
  scene: Scene,
  label: string,
  mutated: () => boolean,
  body: () => Promise<T>,
  source: ActionSource = 'cmd',
): Promise<T> {
  scene.startUndoTxn(label)
  txnBegin(scene, label, source)
  openTxns++
  try {
    return await body()
  } finally {
    openTxns--
    const commit = mutated()
    if (commit) scene.commitUndoTxn()
    else scene.rollbackUndoTxn()
    txnEnd(scene, commit)
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
