/**
 * @file plugins/agent/worker/turnLoop.ts
 * @description One turn: ask the model, run what it asks for, repeat until it
 * stops asking.
 *
 * Runs in the Web Worker so that a tool call is a direct function call into
 * the existing services rather than a round trip through the renderer, and so
 * that every mutation of one turn can sit inside a single undo transaction.
 *
 * The loop itself is the AI SDK's (`streamText` + `stopWhen`); this file owns
 * the undo transaction around it, the progress it streams to the panel, and
 * cancellation. Nothing here names a provider -- `modelProvider.ts` turns the
 * user's model setting into a model and a bag of options, and the same code
 * drives OpenAI and Anthropic.
 *
 * The undo transaction is committed, not rolled back, as soon as any mutating
 * tool has succeeded -- even when the turn is then cancelled or fails. C++
 * `rollbackTxn` actually reverts the pending edits, so rolling back a
 * half-finished turn would undo changes the user has already watched appear.
 * A turn that only read is rolled back instead, because committing an empty
 * transaction clears the redo stack.
 */

import { isStepCount, streamText } from 'ai'
import type { ModelMessage } from 'ai'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import { fail, ok } from '@renderer/worker/shared/result'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { cancelStream } from '@renderer/worker/server/services/helpers/streamFetchToReader'
import type {
  AgentProgressUpdate,
  AgentRunTurnArgs,
  AgentRunTurnResult,
  AgentUsage,
} from '../shared/agentTypes'
import { AGENT_PROGRESS_CHANNEL } from '../shared/agentTypes'
import { parseModelSpec, sanitizeHistory } from '../shared/modelSpec'
import type { ModelSpec } from '../shared/modelSpec'
import { createModel, describeApiError, providerOptionsFor } from './modelProvider'
import type { CreateModel } from './modelProvider'
import { buildSceneSnapshot, formatSceneSnapshot } from './sceneSnapshot'
import { SYSTEM_PROMPT } from './prompt/systemPrompt'
import { AGENT_TOOLS, buildAiSdkTools } from './tools/index'
import type { AgentTool, TurnContext } from './tools/types'
import { summarizeOutcome } from './toolOutput'

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

/** Overridable so a test can drive a whole turn against a mock model. */
export interface TurnDeps {
  createModel: CreateModel
  /** The catalogue to offer. Tests pass their own; production uses all of it. */
  tools?: readonly AgentTool[]
}

const DEFAULT_DEPS: TurnDeps = { createModel }

function push(ctx: WorkerContext, update: AgentProgressUpdate): void {
  ctx.svc.pushMessage(AGENT_PROGRESS_CHANNEL, update)
}

/** The label the turn's undo entry carries. */
function undoLabel(userText: string): string {
  const oneLine = userText.replace(/\s+/g, ' ').trim()
  return `AI: ${oneLine.length > 40 ? `${oneLine.slice(0, 40)}...` : oneLine}`
}

/** The user's message, with the scene described ahead of it. */
function buildUserItem(ctx: WorkerContext, args: AgentRunTurnArgs): ModelMessage {
  const snapshot = buildSceneSnapshot(ctx, { sceneId: args.sceneId, viewId: args.viewId })
  return {
    role: 'user',
    content: `${formatSceneSnapshot(snapshot)}\n\n${args.userText}`,
  }
}

/**
 * The messages to send, with a cache breakpoint on the last one.
 *
 * Anthropic caches the whole prefix up to a breakpoint -- tools, then the
 * instructions, then the history -- and the next turn finds that same message
 * still in its history, so the prefix matches and the read is cheap. The
 * breakpoint has to go on the message rather than on a tool, because tools
 * are rendered before the instructions and a breakpoint there would cache
 * only the tool list.
 *
 * The copy is made here, at send time: what goes into the conversation the
 * renderer keeps is the plain message, so the OpenAI history stays
 * byte-identical to what it would have been.
 */
function withCacheBreakpoint(spec: ModelSpec, messages: ModelMessage[]): ModelMessage[] {
  if (spec.provider !== 'anthropic' || messages.length === 0) return messages
  const last = messages[messages.length - 1]
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      providerOptions: {
        ...last.providerOptions,
        anthropic: { ...last.providerOptions?.anthropic, cacheControl: { type: 'ephemeral' } },
      },
    } as ModelMessage,
  ]
}

/** Zeroed usage, for a turn that failed before the model answered. */
const NO_USAGE: AgentUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }

/** One line about a failure, for a transcript row. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Run one turn to completion.
 *
 * @param deps - injected in tests; production passes nothing.
 * @returns Every message to append to the conversation, or a failure. A
 *   cancelled turn comes back with code `canceled` and no messages: the next
 *   turn's scene snapshot describes whatever actually happened.
 */
export async function runTurn(
  ctx: WorkerContext,
  args: AgentRunTurnArgs,
  deps: TurnDeps = DEFAULT_DEPS,
): Promise<AgentRunTurnResult> {
  const scene: Scene | null = getSceneOrNull(ctx, args.sceneId)
  if (!scene) return fail('scene not found', 'not-found')
  if (args.apiKey === '') return fail('No API key is set.', 'invalid-args')

  const parsed = parseModelSpec(args.model)
  if ('error' in parsed) return fail(parsed.error, 'invalid-args')
  const spec: ModelSpec = parsed

  const controller = new AbortController()
  activeTurns.set(args.turnId, controller)

  const turn: TurnContext = {
    turnId: args.turnId,
    sceneId: args.sceneId,
    viewId: args.viewId,
    mutated: false,
    callId: '',
    noteStream: (reqId: string) => { noteStream(args.turnId, reqId) },
    outcomes: new Map(),
    inflight: new Set(),
    queue: Promise.resolve(),
  }

  const userItem = buildUserItem(ctx, args)
  const messages = withCacheBreakpoint(spec, [
    ...sanitizeHistory(args.history, spec.provider),
    userItem,
  ])

  let finalText = ''
  let toolCalls = 0
  let finishReason = ''
  let failure: unknown = null
  let canceled = false

  scene.startUndoTxn(undoLabel(args.userText))
  try {
    const result = streamText({
      model: deps.createModel(spec, args.apiKey),
      instructions: SYSTEM_PROMPT,
      messages,
      tools: buildAiSdkTools(deps.tools ?? AGENT_TOOLS, ctx, turn),
      stopWhen: isStepCount(MAX_ROUNDS),
      abortSignal: controller.signal,
      ...(args.reasoningEffort === 'default' ? {} : { reasoning: args.reasoningEffort }),
      providerOptions: providerOptionsFor(spec),
      // Recoverable errors arrive as `error` parts below; without this the
      // SDK also logs them, which in the worker means a console line the
      // user cannot see and cannot act on.
      onError: () => undefined,
    })

    // Consumed to the end on every path: breaking out leaves the response
    // body open. An abort closes the stream rather than throwing, so it
    // arrives here too.
    for await (const part of result.stream) {
      switch (part.type) {
        case 'start-step':
          push(ctx, { kind: 'status', turnId: args.turnId, phase: 'thinking' })
          break
        case 'text-start':
          // A step may answer, call a tool, then answer again. Without a
          // break the two run together as one sentence.
          if (finalText !== '') {
            finalText += '\n\n'
            push(ctx, { kind: 'text_delta', turnId: args.turnId, delta: '\n\n' })
          }
          break
        case 'text-delta':
          finalText += part.text
          push(ctx, { kind: 'text_delta', turnId: args.turnId, delta: part.text })
          break
        case 'tool-call':
          toolCalls++
          push(ctx, { kind: 'status', turnId: args.turnId, phase: 'calling-tools' })
          push(ctx, {
            kind: 'tool_call',
            turnId: args.turnId,
            callId: part.toolCallId,
            name: part.toolName,
            input: JSON.stringify(part.input),
          })
          break
        case 'tool-result': {
          const outcome = turn.outcomes.get(part.toolCallId)
          push(ctx, {
            kind: 'tool_result',
            turnId: args.turnId,
            callId: part.toolCallId,
            name: part.toolName,
            ok: outcome?.ok ?? true,
            summary: outcome ? summarizeOutcome(outcome) : String(part.output),
          })
          break
        }
        case 'tool-error':
          // Only the SDK's own refusals reach here -- an unknown tool name or
          // arguments that failed the schema. A tool that fails reports it
          // inside its result instead.
          push(ctx, {
            kind: 'tool_result',
            turnId: args.turnId,
            callId: part.toolCallId,
            name: part.toolName,
            ok: false,
            summary: errorText(part.error),
          })
          break
        case 'error':
          failure ??= part.error
          break
        case 'abort':
          canceled = true
          break
        case 'finish':
          finishReason = part.finishReason
          break
        default:
          break
      }
    }

    // A cancelled stream does not wait for a tool that is still running, and
    // one still writing to the scene after the transaction closed would put
    // an edit outside it.
    await Promise.allSettled(turn.inflight)

    if (canceled || controller.signal.aborted) return fail('canceled', 'canceled')
    if (failure !== null) return fail(describeApiError(failure, spec), 'io')

    // Only on the success path: after an abort or an error these settle late
    // or reject, and an unhandled rejection in the worker is fatal.
    const [responseMessages, usage] = await Promise.all([
      result.responseMessages,
      result.usage,
    ])

    return ok({
      appended: [userItem, ...responseMessages],
      finalText,
      usage: {
        inputTokens: usage.inputTokens ?? NO_USAGE.inputTokens,
        outputTokens: usage.outputTokens ?? NO_USAGE.outputTokens,
        cachedTokens: usage.inputTokenDetails?.cacheReadTokens ?? NO_USAGE.cachedTokens,
      },
      mutated: turn.mutated,
      toolCalls,
      // Still asking for tools when the step limit ran out.
      roundLimitHit: finishReason === 'tool-calls',
    })
  } catch (e) {
    // The signal is authoritative: this controller is aborted only by
    // `cancelTurn`, so a raised abort can only be ours.
    if (controller.signal.aborted) return fail('canceled', 'canceled')
    return fail(describeApiError(e, spec), 'io')
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
