/**
 * @file plugins/agent/worker/turnLoop.ts
 * @description One turn: ask the model, run what it asks for, repeat until it
 * stops asking.
 *
 * Runs in the Web Worker so that a tool call is a direct function call into
 * the existing services rather than a round trip through the renderer, and so
 * that every mutation of one turn can sit inside a single undo transaction.
 *
 * Two things govern the shape of this file.
 *
 * An unhandled rejection in the worker is fatal: `worker_launcher` posts
 * `__worker_crash__` and the transport tears the worker down. So every await
 * is inside the try, and the stream is either consumed to its end or aborted
 * -- never abandoned mid-iteration.
 *
 * And the undo transaction is committed, not rolled back, as soon as any
 * mutating tool has succeeded -- even when the turn is then cancelled or
 * fails. C++ `rollbackTxn` actually reverts the pending edits, so rolling
 * back a half-finished turn would undo changes the user has already watched
 * appear. A turn that only read is rolled back instead, because committing an
 * empty transaction clears the redo stack.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import { fail, ok } from '@renderer/worker/shared/result'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { cancelStream } from '@renderer/worker/server/services/helpers/streamFetchToReader'
import type {
  AgentInputItem,
  AgentProgressUpdate,
  AgentRunTurnArgs,
  AgentRunTurnResult,
  AgentUsage,
} from '../shared/agentTypes'
import { AGENT_PROGRESS_CHANNEL } from '../shared/agentTypes'
import { createOpenAIClient } from './openaiClient'
import type { AgentOpenAIClient, AgentStreamEvent, CreateClient } from './openaiClient'
import { buildSceneSnapshot, formatSceneSnapshot } from './sceneSnapshot'
import { SYSTEM_PROMPT } from './prompt/systemPrompt'
import { findTool, OPENAI_TOOLS } from './tools/index'
import type { ToolOutcome, TurnContext } from './tools/types'
import { normalizeServiceResult, serializeToolOutput, summarizeOutcome } from './toolOutput'

/**
 * How many model-then-tools rounds one turn may take.
 *
 * A bound rather than a budget: a model that has genuinely lost the thread
 * will keep calling tools forever, and the user is paying per round.
 */
const MAX_ROUNDS = 16

/** Turns currently running, so `cancelTurn` can reach their controllers. */
const activeTurns = new Map<string, AbortController>()

/**
 * Stream requests each running turn started, so cancelling the turn aborts
 * the downloads too. Keyed by turn id; the values are the request ids
 * `streamFetchToReader` knows them by.
 */
const turnStreams = new Map<string, Set<string>>()

/** Overridable so a test can drive a whole turn against a fake client. */
export interface TurnDeps {
  createClient: CreateClient
}

const DEFAULT_DEPS: TurnDeps = { createClient: createOpenAIClient }

function push(ctx: WorkerContext, update: AgentProgressUpdate): void {
  ctx.svc.pushMessage(AGENT_PROGRESS_CHANNEL, update)
}

/** The label the turn's undo entry carries. */
function undoLabel(userText: string): string {
  const oneLine = userText.replace(/\s+/g, ' ').trim()
  return `AI: ${oneLine.length > 40 ? `${oneLine.slice(0, 40)}...` : oneLine}`
}

/** The user's message, with the scene described ahead of it. */
function buildUserItem(ctx: WorkerContext, args: AgentRunTurnArgs): AgentInputItem {
  const snapshot = buildSceneSnapshot(ctx, { sceneId: args.sceneId, viewId: args.viewId })
  return {
    role: 'user',
    content: `${formatSceneSnapshot(snapshot)}\n\n${args.userText}`,
  } as AgentInputItem
}

/** Run one function call and turn its outcome into an input item. */
async function runToolCall(
  ctx: WorkerContext,
  turn: TurnContext,
  call: { name: string; arguments: string; call_id: string },
): Promise<{ item: AgentInputItem; outcome: ToolOutcome; mutates: boolean }> {
  push(ctx, {
    kind: 'tool_call',
    turnId: turn.turnId,
    callId: call.call_id,
    name: call.name,
    input: call.arguments,
  })

  const tool = findTool(call.name)
  let outcome: ToolOutcome
  let mutates = false

  if (!tool) {
    outcome = { ok: false, error: `There is no tool called "${call.name}".` }
  } else {
    mutates = tool.mutates
    try {
      // `strict: true` means the API validated the shape already; what can
      // still fail here is the scene, not the JSON.
      const input = JSON.parse(call.arguments || '{}') as Record<string, unknown>
      outcome = await tool.run(ctx, input, { ...turn, callId: call.call_id })
    } catch (e) {
      outcome = normalizeServiceResult(
        null,
        e instanceof Error ? e.message : `${call.name} failed.`,
      )
    }
  }

  push(ctx, {
    kind: 'tool_result',
    turnId: turn.turnId,
    callId: call.call_id,
    name: call.name,
    ok: outcome.ok,
    summary: summarizeOutcome(outcome),
  })

  return {
    item: {
      type: 'function_call_output',
      call_id: call.call_id,
      output: serializeToolOutput(outcome),
    } as AgentInputItem,
    outcome,
    mutates,
  }
}

/** An APIError turned into something worth showing the user. */
function describeApiError(e: unknown): string {
  const status = (e as { status?: number })?.status
  const message = e instanceof Error ? e.message : String(e)
  if (status === 401) return 'Invalid API key (401). Check Settings > Plugins > AI Agent.'
  if (status === 404) return `Unknown model (404). Check the model name in Settings. ${message}`
  if (status === 429) return 'Rate limited by the API (429). Wait a moment and try again.'
  return message
}

/** Zeroed usage, for a turn that failed before the API answered. */
const NO_USAGE: AgentUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }

/**
 * Run one turn to completion.
 *
 * @param deps - injected in tests; production passes nothing.
 * @returns Every item to append to the conversation, or a failure. A cancelled
 *   turn comes back with code `canceled` and no items: the next turn's scene
 *   snapshot describes whatever actually happened.
 */
export async function runTurn(
  ctx: WorkerContext,
  args: AgentRunTurnArgs,
  deps: TurnDeps = DEFAULT_DEPS,
): Promise<AgentRunTurnResult> {
  const scene: Scene | null = getSceneOrNull(ctx, args.sceneId)
  if (!scene) return fail('scene not found', 'not-found')
  if (args.apiKey === '') return fail('No API key is set.', 'invalid-args')

  const controller = new AbortController()
  activeTurns.set(args.turnId, controller)

  const turn: TurnContext = {
    turnId: args.turnId,
    sceneId: args.sceneId,
    viewId: args.viewId,
    mutated: false,
    callId: '',
    noteStream: (reqId: string) => { noteStream(args.turnId, reqId) },
  }

  const userItem = buildUserItem(ctx, args)
  const input: AgentInputItem[] = [...args.history, userItem]
  const appended: AgentInputItem[] = [userItem]

  let finalText = ''
  let toolCalls = 0
  let roundLimitHit = false
  const usage: AgentUsage = { ...NO_USAGE }

  scene.startUndoTxn(undoLabel(args.userText))
  try {
    const client: AgentOpenAIClient = deps.createClient(args.apiKey)

    for (let round = 0; round < MAX_ROUNDS; round++) {
      push(ctx, { kind: 'status', turnId: args.turnId, phase: 'thinking' })

      const stream = await client.responses.create(
        {
          model: args.model,
          instructions: SYSTEM_PROMPT,
          input,
          tools: OPENAI_TOOLS,
          store: false,
          parallel_tool_calls: true,
          stream: true,
          ...(args.reasoningEffort === 'default'
            ? {}
            : { reasoning: { effort: args.reasoningEffort } }),
        },
        { signal: controller.signal },
      )

      let response: AgentStreamEvent['response'] | null = null
      let failure: string | null = null

      // Consumed to the end on every path: breaking out of a `for await`
      // leaves the underlying response body open.
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          const delta = event.delta ?? ''
          finalText += delta
          push(ctx, { kind: 'text_delta', turnId: args.turnId, delta })
        } else if (
          event.type === 'response.completed' ||
          event.type === 'response.incomplete'
        ) {
          response = event.response ?? null
        } else if (event.type === 'response.failed' || event.type === 'error') {
          failure =
            event.response?.error?.message ??
            event.message ??
            'The model failed to answer.'
        }
      }

      if (failure !== null) return fail(failure, 'io')
      if (!response) return fail('The model returned no response.', 'io')

      usage.inputTokens += response.usage?.input_tokens ?? 0
      usage.outputTokens += response.usage?.output_tokens ?? 0
      usage.cachedTokens += response.usage?.input_tokens_details?.cached_tokens ?? 0

      // The whole output goes back verbatim, reasoning items included: the
      // API needs them to continue the chain of thought across a tool call.
      const output = (response.output ?? []) as AgentInputItem[]
      input.push(...output)
      appended.push(...output)

      const calls = output.filter(
        (item): item is AgentInputItem & { name: string; arguments: string; call_id: string } =>
          (item as { type?: string }).type === 'function_call',
      )
      if (calls.length === 0 || response.status === 'incomplete') break

      push(ctx, { kind: 'status', turnId: args.turnId, phase: 'calling-tools' })
      for (const call of calls) {
        const { item, outcome, mutates } = await runToolCall(ctx, turn, call)
        toolCalls++
        if (mutates && outcome.ok) turn.mutated = true
        input.push(item)
        appended.push(item)
      }

      if (round === MAX_ROUNDS - 1) roundLimitHit = true
    }

    return ok({
      appended,
      finalText,
      usage,
      mutated: turn.mutated,
      toolCalls,
      roundLimitHit,
    })
  } catch (e) {
    if (controller.signal.aborted) return fail('canceled', 'canceled')
    return fail(describeApiError(e), 'io')
  } finally {
    // Commit whenever the scene was actually changed, including on a cancel:
    // rolling back would revert edits the user has already seen.
    if (turn.mutated) scene.commitUndoTxn()
    else scene.rollbackUndoTxn()
    activeTurns.delete(args.turnId)
    turnStreams.delete(args.turnId)
  }
}

/**
 * Stop a running turn.
 *
 * Aborts the model request and any download the turn started -- a fetch has
 * its own AbortController inside `streamFetchToReader`, keyed by the reqId
 * the file tool builds from the turn and call ids.
 */
export function cancelTurn(_ctx: WorkerContext, args: { turnId: string }): ReturnType<typeof ok> {
  const controller = activeTurns.get(args.turnId)
  if (controller) controller.abort()
  cancelStreamsOfTurn(args.turnId)
  return ok()
}

function noteStream(turnId: string, reqId: string): void {
  const ids = turnStreams.get(turnId) ?? new Set<string>()
  ids.add(reqId)
  turnStreams.set(turnId, ids)
}

function cancelStreamsOfTurn(turnId: string): void {
  for (const reqId of turnStreams.get(turnId) ?? []) cancelStream(reqId)
  turnStreams.delete(turnId)
}
