/**
 * @file plugins/agent/worker/tools/index.ts
 * @description The tool catalogue, and the adapter that hands it to the model.
 *
 * Sorted by name and frozen in that order. The tool list is part of the
 * cached prompt prefix, so a catalogue that reordered itself between turns
 * would miss the cache every time for no benefit.
 *
 * Files here are deliberately NOT named `*.service.ts`: the worker registry
 * globs that pattern across every plugin directory and would try to register
 * a tool module as a service.
 */

import { jsonSchema, tool } from 'ai'
import type { ToolSet } from 'ai'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { normalizeServiceResult, serializeToolOutput } from '../toolOutput'
import { ANALYSIS_TOOLS } from './analysisTools'
import { FILE_TOOLS } from './fileTools'
import { MEASURE_TOOLS } from './measureTools'
import { RENDERER_TOOLS } from './rendererTools'
import { SCENE_TOOLS } from './sceneTools'
import { SELECTION_TOOLS } from './selectionTools'
import type { AgentTool, ToolOutcome, TurnContext } from './types'

/** Every tool the model may call, by name. */
export const AGENT_TOOLS: readonly AgentTool[] = [
  ...SCENE_TOOLS,
  ...SELECTION_TOOLS,
  ...RENDERER_TOOLS,
  ...FILE_TOOLS,
  ...ANALYSIS_TOOLS,
  ...MEASURE_TOOLS,
].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

/** Lookup by the name the model used. */
export function findTool(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.name === name)
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
 * @returns the serialized outcome, which is what the model reads. A failure
 *   is reported inside it as `ok: false` rather than by throwing: throwing
 *   would make the SDK replace the payload with its own error text, and only
 *   one of the two providers has a notion of an errored tool result.
 */
function runQueued(
  t: AgentTool,
  ctx: WorkerContext,
  turn: TurnContext,
  input: Record<string, unknown>,
  toolCallId: string,
): Promise<string> {
  const run = turn.queue.then(async () => {
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
    return serializeToolOutput(outcome)
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
