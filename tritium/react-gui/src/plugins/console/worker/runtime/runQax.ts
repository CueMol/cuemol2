/**
 * @file plugins/console/worker/runtime/runQax.ts
 * @description Running the actions of a qax file (CueMol actions, XML).
 *
 * An `<op>` runs as an MCP call does: its arguments are read by
 * `readToolArgs`, with node paths resolved in the current scene, and the op
 * goes through `invokeOp`. A `<cmd>` is a native console line, handed back
 * to the console runtime. A `<note>` is skipped.
 *
 * Whether each action is its own undo transaction is the caller's choice
 * (`runCommand.ts`): alone on the line, a qax file replays the transactions
 * it was written from; inside a larger submission or script it is part of
 * that one transaction, as any script is.
 */

import * as fs from 'fs'
import { findOp, invokeOp, readToolArgs } from '@renderer/worker/server/catalog'
import type { Param } from '@renderer/worker/server/catalog/params'
import { resolveRef } from '@renderer/worker/server/catalog/refs'
import type { RefKind } from '@renderer/worker/server/catalog/refs'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { parseQax } from '@renderer/worker/server/actions/qax/codec'
import type { QaxDoc, QaxItem } from '@renderer/worker/server/actions/qax/model'
import { QAX_EXT } from '@renderer/worker/server/actions/qax/model'
import { qaxToInput } from '@renderer/worker/server/actions/qax/values'
import { opContextOf } from './opContext'
import type { CmdContext } from './types'

/** Whether a script path names a qax file. */
export function isQaxPath(filePath: string): boolean {
  return filePath.trim().toLowerCase().endsWith(QAX_EXT)
}

/** Read and parse a qax file, or say why it cannot be. */
export function readQaxFile(filePath: string): QaxDoc | { error: string } {
  let text: string
  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch {
    return { error: `Error: cannot read script: ${filePath}` }
  }
  const doc = parseQax(text)
  return 'error' in doc ? { error: `Error: ${filePath}: ${doc.error}` } : doc
}

/** What running the items of one action needs from the console runtime. */
export interface QaxRunner {
  ctx: WorkerContext
  /** A command context for one op: printing, streams, Stop, mutation. */
  cmdContext(): CmdContext
  /** Run one native console line; false when it failed (it reported why). */
  runLine(text: string): Promise<boolean>
  error(text: string): void
}

const REF_KIND: Readonly<Record<string, RefKind>> = {
  object: 'object',
  molecule: 'molecule',
  renderer: 'renderer',
  node: 'node',
}

/** The uid a node argument names in the current scene. */
function resolveNode(ctx: WorkerContext, sceneId: number) {
  return (ref: { path?: string; uid?: number }, p: Param<unknown>, argName: string): number | { error: string } => {
    const kind = REF_KIND[p.semantic ?? ''] ?? 'node'
    // The path is what carries over to another session; the uid only when
    // there is no path to look up.
    const text = ref.path ?? (ref.uid !== undefined ? `#${ref.uid}` : '')
    const hit = resolveRef(ctx, sceneId, text, kind)
    return hit.ok ? hit.node.id : { error: `${argName}: ${hit.error}` }
  }
}

/** Run one `<op>`. */
async function runOp(item: Extract<QaxItem, { kind: 'op' }>, r: QaxRunner): Promise<boolean> {
  const op = findOp(item.name)
  if (!op) {
    r.error(`Error: unknown op "${item.name}"`)
    return false
  }
  const cc = r.cmdContext()
  const read = qaxToInput(item, op.params, resolveNode(r.ctx, cc.sceneId))
  if (!read.ok) {
    r.error(`Error: ${item.name}: ${read.error}`)
    return false
  }
  const input = read.input
  if (op.outsideTxn?.(input)) {
    r.error(`Error: ${item.name} cannot run from a qax file (it opens or saves a scene)`)
    return false
  }
  const args = readToolArgs(op, input)
  if (typeof args === 'string') {
    r.error(`Error: ${item.name}: ${args}`)
    return false
  }
  const outcome = await invokeOp(op, r.ctx, args, opContextOf(cc, 'qax'))
  if (!outcome.ok) {
    r.error(`Error: ${item.name}: ${outcome.error}`)
    return false
  }
  if (op.mutates) cc.markMutated()
  return true
}

/**
 * Run the items of one action in order, stopping at the first failure or at
 * Stop.
 *
 * @returns whether every item ran.
 */
export async function runQaxItems(items: readonly QaxItem[], r: QaxRunner): Promise<boolean> {
  for (const item of items) {
    if (r.cmdContext().stopped()) return false
    if (item.kind === 'note') continue
    const done = item.kind === 'op' ? await runOp(item, r) : await r.runLine(item.text)
    if (!done) return false
  }
  return true
}
