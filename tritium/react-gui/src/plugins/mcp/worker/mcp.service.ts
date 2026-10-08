/**
 * @file plugins/mcp/worker/mcp.service.ts
 * @description The MCP server's worker half: the op catalogue as MCP tools.
 *
 * Every op a tool caller may use is offered, toolsets included: an MCP
 * client lists all its servers' tools and picks for itself, so there is no
 * `enable_toolsets` step as there is for the agent.
 *
 * A call runs the op the same way the agent and the console do (`invokeOp`),
 * in an undo transaction of its own: one call, one Cmd+Z. Files are read and
 * written where the client says (`fileAccess: 'any'`), as at the console --
 * the client is the user's own program on the user's own machine, and only it
 * holds the token.
 *
 * Found by the plugin glob in `worker/server/services/index.ts` and registered
 * under `plugin.mcp.<name>`.
 */

import {
  findOp,
  invokeOp,
  OPS,
  readToolArgs,
  runInTxn,
  serializeToolOutput,
  toolSchema,
  TXN_BUSY_MESSAGE,
  txnBusy,
  txnLabel,
} from '@renderer/worker/server/catalog'
import type { AnyOp, OpContext, OpOutcome } from '@renderer/worker/server/catalog'
import { MCP_INSTRUCTIONS } from '@renderer/worker/server/catalog/guide'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { cancelStream } from '@renderer/worker/server/services/helpers/streamFetchToReader'
import { ok } from '@renderer/worker/shared/result'
import type { Result } from '@renderer/worker/shared/result'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type {
  CallToolArgs,
  CallToolOutcome,
  CancelCallArgs,
  DescribeOutcome,
  ListToolsOutcome,
  McpCallResult,
} from '../shared/mcpTypes'

/** Whether `op` is offered: every op a tool caller may use, and the MCP-only ones. */
function offered(op: AnyOp): boolean {
  return op.expose.tool !== false || op.expose.mcp === true
}

/** The arguments as the text a console would have typed, for `outsideTxn`. */
function rawArgs(args: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v == null ? '' : String(v)]))
}

function describe(): Result<DescribeOutcome> {
  return ok({ instructions: MCP_INSTRUCTIONS })
}

function listTools(): Result<ListToolsOutcome> {
  return ok({
    tools: OPS.filter(offered).map((op) => ({
      name: op.name,
      description: op.description,
      inputSchema: toolSchema(op) as unknown as Record<string, unknown>,
    })),
  })
}

/** A call still running, so `cancelCall` can reach it. */
interface CallState {
  cancelled: boolean
  streams: Set<string>
}

const calls = new Map<string, CallState>()

function failed(message: string): McpCallResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** An op's outcome as MCP content: the JSON text, then the picture if any. */
export function toMcpResult(outcome: OpOutcome): McpCallResult {
  const text = serializeToolOutput(outcome)
  if (!outcome.ok) return { content: [{ type: 'text', text }], isError: true }
  const content: McpCallResult['content'] = [{ type: 'text', text }]
  if (outcome.image) content.push({ type: 'image', data: outcome.image.base64, mimeType: outcome.image.mediaType })
  return { content, isError: false }
}

async function callTool(ctx: WorkerContext, args: CallToolArgs): Promise<Result<CallToolOutcome>> {
  const op = findOp(args.name)
  if (!op || !offered(op)) return ok(failed(`There is no tool named ${args.name}.`))
  const scene = args.sceneId > 0 ? getSceneOrNull(ctx, args.sceneId) : null
  if (!scene) return ok(failed('No scene is open in CueMol. Open a scene (a tab) first.'))
  if (txnBusy()) return ok(failed(TXN_BUSY_MESSAGE))
  const input = readToolArgs(op, args.arguments ?? {})
  if (typeof input === 'string') return ok(failed(input))

  const state: CallState = { cancelled: false, streams: new Set() }
  calls.set(args.callId, state)
  let mutated = false
  let openScene: string | undefined
  const oc: OpContext = {
    sceneId: args.sceneId,
    viewId: args.viewId,
    callId: args.callId,
    markMutated: () => { mutated = true },
    noteStream: (reqId) => { state.streams.add(reqId) },
    streamId: (tag) => `mcp:${args.callId}:${tag}`,
    cancelled: () => state.cancelled,
    fileAccess: 'any',
    openScene: (filePath) => { openScene = filePath },
  }
  try {
    // Saving or opening a scene resets its undo stack, so it runs outside a
    // transaction, as it does alone on a console line.
    const outcome = op.outsideTxn?.(rawArgs(args.arguments ?? {}))
      ? await invokeOp(op, ctx, input, oc)
      : await runInTxn(scene, txnLabel('MCP: ', op.name), () => mutated, () => invokeOp(op, ctx, input, oc))
    const result = toMcpResult(outcome)
    return ok(outcome.ok && openScene ? { ...result, openScene } : result)
  } finally {
    calls.delete(args.callId)
  }
}

/** Stop a call whose client went away; one already finished is not an error. */
function cancelCall(_ctx: WorkerContext, args: CancelCallArgs): Result {
  const state = calls.get(args.callId)
  if (state) {
    state.cancelled = true
    for (const reqId of state.streams) cancelStream(reqId)
  }
  return ok()
}

export const services = {
  describe,
  listTools,
  callTool,
  cancelCall,
}
