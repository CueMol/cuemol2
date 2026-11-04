/**
 * @file plugins/console/worker/runtime/opContext.ts
 * @description The `OpContext` a console command gives the op it runs.
 *
 * Shared by every dialect (the native generated commands, and the PyMOL and
 * ChimeraX commands through `runOp`), so an op sees a console caller the
 * same way from each.
 */

import { findOp, invokeOp } from '@renderer/worker/server/catalog'
import type { OpContext } from '@renderer/worker/server/catalog'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from './types'

/**
 * @param tag - names the call in its stream ids, e.g. `call` or `ray`
 */
export function opContextOf(cc: CmdContext, tag: string): OpContext {
  return {
    sceneId: cc.sceneId,
    viewId: cc.viewId,
    callId: cc.streamId(tag),
    markMutated: () => cc.markMutated(),
    noteStream: (reqId) => cc.noteStream(reqId),
    streamId: (t) => cc.streamId(t),
    openScene: (filePath) => cc.openScene(filePath),
    cancelled: () => cc.stopped(),
    // The person at the prompt chose the path.
    fileAccess: 'any',
  }
}

/** An op's outcome as a dialect command reads it: its data, or an `Error: ` line. */
export type OpRun = { ok: true; data?: unknown } | { ok: false; error: string }

/**
 * Run a catalog op by name as part of a dialect command.
 *
 * A dialect writes to the scene only through ops (`invokeOp`, as every caller
 * of the catalog does), so the checks, the action log entry and the undo
 * label are the ones the native console, the agent and MCP get.
 *
 * @param tag - names the call in its stream ids (`opContextOf`)
 * @returns the op's data, or its error prefixed with `Error: `
 */
export async function runOp(
  ctx: WorkerContext,
  cc: CmdContext,
  tag: string,
  name: string,
  args: Record<string, unknown>,
): Promise<OpRun> {
  const op = findOp(name)
  if (!op) return { ok: false, error: `Error: no operation ${name}` }
  const res = await invokeOp(op, ctx, args, opContextOf(cc, tag))
  return res.ok ? { ok: true, data: res.data } : { ok: false, error: `Error: ${res.error}` }
}
