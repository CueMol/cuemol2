/**
 * @file plugins/agent/worker/tools/index.ts
 * @description The tools the model may call, and the adapter that hands them
 * to the SDK.
 *
 * The tools are the core op catalogue's `tool: 'core'` ops
 * (`worker/server/catalog`), in its order: the schema is generated from each
 * op's parameters, and a call reads the model's arguments into the op's types
 * and runs it through the catalogue's `invokeOp`. Nothing here declares an
 * operation of its own.
 */

import { jsonSchema, tool } from 'ai'
import type { ToolSet } from 'ai'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { ModelMessage } from 'ai'
import {
  invokeOp,
  readToolArgs,
  TOOL_OPS,
  TOOLSETS,
  toolSchema,
  toolsetOps,
} from '@renderer/worker/server/catalog'
import type { AnyOp, OpContext } from '@renderer/worker/server/catalog'
import { normalizeServiceResult, serializeToolOutput, toolModelOutput } from '../toolOutput'
import type { ToolRunOutput } from '../toolOutput'
import type { AgentTool, ToolOutcome, TurnContext } from './types'

/** What an op needs from the turn it runs in. */
function opContextOf(turn: TurnContext): OpContext {
  return {
    sceneId: turn.sceneId,
    viewId: turn.viewId,
    callId: turn.callId,
    markMutated: () => { turn.mutated = true },
    noteStream: turn.noteStream,
    // Namespaced by turn and call, which is how `cancelTurn` finds it.
    streamId: () => `${turn.turnId}:${turn.callId}`,
    cancelled: () => turn.aborted?.() ?? false,
    // A model names a file, never a place: what it writes goes to the desktop.
    fileAccess: 'desktop',
  }
}

/** One op as the model sees it. */
function opTool(op: AnyOp): AgentTool {
  return {
    name: op.name,
    description: op.description,
    parameters: toolSchema(op),
    mutates: op.mutates,
    run(ctx, input, turn): Promise<ToolOutcome> | ToolOutcome {
      const args = readToolArgs(op, input)
      if (typeof args === 'string') return { ok: false, error: args }
      return invokeOp(op, ctx, args, opContextOf(turn))
    },
  }
}

function byName(a: AgentTool, b: AgentTool): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

/** The name of the tool that switches toolsets on. */
export const ENABLE_TOOLSETS = 'enable_toolsets'

/** The tools each toolset adds once it is on. */
const TOOLSET_TOOLS: ReadonlyMap<string, readonly AgentTool[]> = new Map(
  TOOLSETS.map((ts) => [ts.id, toolsetOps(ts.id).map(opTool)]),
)

/** Which toolset a tool belongs to; absent for a core tool. */
const TOOLSET_OF: ReadonlyMap<string, string> = new Map(
  [...TOOLSET_TOOLS].flatMap(([id, tools]) => tools.map((t) => [t.name, id] as const)),
)

/**
 * Switch toolsets on for the rest of the conversation.
 *
 * Kept on once on, so the tool list -- part of the cached prompt prefix --
 * changes once per toolset rather than back and forth.
 */
const enableToolsets: AgentTool = {
  name: ENABLE_TOOLSETS,
  description:
    'Switch on more tools for this conversation. The tools below are always available; ' +
    'these groups add more once switched on, from your next step: ' +
    TOOLSETS.map((ts) => `"${ts.id}" -- ${ts.description}`).join(' ') +
    ' Switch a group on only when the request needs it.',
  parameters: {
    type: 'object',
    properties: {
      toolsets: {
        type: 'array',
        description: 'The groups to switch on.',
        items: { type: 'string', enum: TOOLSETS.map((ts) => ts.id) },
      },
    },
    required: ['toolsets'],
    additionalProperties: false,
  },
  mutates: false,
  run(_ctx, input, turn) {
    const asked = Array.isArray(input.toolsets) ? input.toolsets.map(String) : []
    const unknown = asked.filter((id) => !TOOLSET_TOOLS.has(id))
    if (unknown.length > 0) {
      return { ok: false, error: `No toolset named ${unknown.join(', ')}. Known: ${TOOLSETS.map((t) => t.id).join(', ')}.` }
    }
    for (const id of asked) turn.toolsets.add(id)
    return {
      ok: true,
      data: {
        enabled: [...turn.toolsets],
        tools: asked.flatMap((id) => (TOOLSET_TOOLS.get(id) ?? []).map((t) => t.name)),
      },
    }
  },
}

/** The tools always offered: the core ops, and the switch for the rest. */
export const AGENT_TOOLS: readonly AgentTool[] = [...TOOL_OPS.map(opTool), enableToolsets].sort(byName)

/** Every tool a turn may offer, toolsets included, by name. */
export const ALL_AGENT_TOOLS: readonly AgentTool[] = [
  ...AGENT_TOOLS,
  ...[...TOOLSET_TOOLS.values()].flat(),
].sort(byName)

/**
 * The names to offer this step: every tool that is core (or unknown to the
 * catalogue, as a test's own tool is), plus the switched-on toolsets'.
 */
export function activeToolNames(tools: readonly AgentTool[], enabled: ReadonlySet<string>): string[] {
  return tools
    .filter((t) => {
      const ts = TOOLSET_OF.get(t.name)
      return ts === undefined || enabled.has(ts)
    })
    .map((t) => t.name)
}

/**
 * The toolsets an earlier turn of this conversation switched on, read back
 * from its tool calls, so they stay on without the renderer keeping state.
 */
export function toolsetsEnabledIn(history: readonly ModelMessage[]): Set<string> {
  const out = new Set<string>()
  for (const msg of history) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue
    for (const part of msg.content) {
      if (part.type !== 'tool-call' || part.toolName !== ENABLE_TOOLSETS) continue
      const ids = (part.input as { toolsets?: unknown } | undefined)?.toolsets
      if (!Array.isArray(ids)) continue
      for (const id of ids) if (TOOLSET_TOOLS.has(String(id))) out.add(String(id))
    }
  }
  return out
}

/** Lookup by the name the model used. */
export function findTool(name: string): AgentTool | undefined {
  return ALL_AGENT_TOOLS.find((t) => t.name === name)
}

/**
 * The catalogue as the SDK takes it, bound to one turn.
 *
 * @param tools - the catalogue; taken as an argument so a test can supply its
 *   own without mocking this module.
 * @param strict - whether to ask the provider to enforce each schema as it
 *   samples. Not every provider can do that for a catalogue this size; see
 *   `usesStrictTools`.
 */
export function buildAiSdkTools(
  tools: readonly AgentTool[],
  ctx: WorkerContext,
  turn: TurnContext,
  strict: boolean,
): ToolSet {
  const out: ToolSet = {}
  for (const t of tools) {
    out[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema<Record<string, unknown>>(
        t.parameters as unknown as Parameters<typeof jsonSchema>[0],
      ),
      strict,
      execute: (input: unknown, { toolCallId }: { toolCallId: string }) =>
        runQueued(t, ctx, turn, input as Record<string, unknown>, toolCallId),
      // A picture cannot ride inside the JSON text; this puts it next to it.
      toModelOutput: ({ output }: { output: ToolRunOutput }) => toolModelOutput(output),
    })
  }
  return out
}

/**
 * Run one tool call, after every earlier call of this turn has finished.
 *
 * The SDK runs a step's calls concurrently. Serialising them keeps the scene
 * edits in the order the model asked for, which is what the transcript and
 * the single undo transaction both describe.
 *
 * @returns the serialized outcome, which is what the model reads, with the
 *   outcome's picture beside it when it has one. A failure
 *   is reported inside it as `ok: false` rather than by throwing: throwing
 *   would make the SDK replace the payload with its own error text, and only
 *   not every provider has a notion of an errored tool result.
 */
function runQueued(
  t: AgentTool,
  ctx: WorkerContext,
  turn: TurnContext,
  input: Record<string, unknown>,
  toolCallId: string,
): Promise<ToolRunOutput> {
  const run = turn.queue.then(async (): Promise<ToolRunOutput> => {
    let outcome: ToolOutcome
    try {
      outcome = await t.run(ctx, input, { ...turn, callId: toolCallId })
    } catch (e) {
      outcome = normalizeServiceResult(
        null,
        e instanceof Error ? e.message : `${t.name} failed.`,
      )
    }
    // The one place a turn is marked as having changed the scene, which is
    // what decides commit against rollback when it ends.
    if (t.mutates && outcome.ok) turn.mutated = true
    turn.outcomes.set(toolCallId, outcome)
    const text = serializeToolOutput(outcome)
    return outcome.ok && outcome.image ? { text, image: outcome.image } : text
  })

  // An aborted stream closes without waiting for a running tool, so the loop
  // waits on these before it closes the undo transaction.
  turn.inflight.add(run)
  void run.finally(() => turn.inflight.delete(run))
  turn.queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
