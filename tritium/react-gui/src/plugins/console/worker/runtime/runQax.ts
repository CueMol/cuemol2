/**
 * @file plugins/console/worker/runtime/runQax.ts
 * @description Running the actions of a qax file (CueMol actions, XML).
 *
 * The items run in core (`actions/qax/run.ts`, shared with the Action
 * library); this adapter gives it the console's context, and runs a `<cmd>`
 * as a native console line.
 *
 * Whether each action is its own undo transaction is the caller's choice
 * (`runCommand.ts`): alone on the line, a qax file replays the transactions
 * it was written from; inside a larger submission or script it is part of
 * that one transaction, as any script is.
 */

import * as fs from 'fs'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { parseQax } from '@renderer/worker/server/actions/qax/codec'
import type { QaxDoc, QaxItem } from '@renderer/worker/server/actions/qax/model'
import { QAX_EXT } from '@renderer/worker/server/actions/qax/model'
import { runQaxItems as runItems } from '@renderer/worker/server/actions/qax/run'
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

/**
 * Run the items of one action in order, stopping at the first failure or at
 * Stop.
 *
 * @returns whether every item ran.
 */
export async function runQaxItems(items: readonly QaxItem[], r: QaxRunner): Promise<boolean> {
  const cc = r.cmdContext()
  return runItems(items, {
    ctx: r.ctx,
    sceneId: cc.sceneId,
    opContext: () => opContextOf(r.cmdContext(), 'qax'),
    stopped: () => r.cmdContext().stopped(),
    runLine: (text) => r.runLine(text),
    error: (text) => r.error(text),
  })
}
