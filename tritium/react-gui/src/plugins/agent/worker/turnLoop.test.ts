/**
 * @file plugins/agent/worker/turnLoop.test.ts
 * @description The undo-transaction contract of one agent turn.
 *
 * The rule the rest of the loop is built around: a turn that changed the
 * scene commits, whatever else happened to it, and a turn that only read
 * rolls back. Both halves matter and neither is visible from the outside --
 * committing an empty transaction silently clears the user's redo stack, and
 * rolling back a cancelled turn silently reverts changes they watched appear.
 *
 * The model is a `MockLanguageModelV4` and the catalogue is a pair of fake
 * tools, both injected through `TurnDeps`, so the whole loop runs with no
 * network, no key, and no module mocking.
 */

import { describe, it, expect, vi } from 'vitest'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

// The snapshot reads the scene through C++ JSON the fakes do not model; the
// turn under test does not depend on what it says.
vi.mock('./sceneSnapshot', () => ({
  buildSceneSnapshot: () => ({ sceneId: 1, viewId: 2, objects: [], namedSelections: [] }),
  formatSceneSnapshot: () => '<scene_state>{}</scene_state>',
}))

import { fakeScene, fakeView, makeWorkerCtx } from '@renderer/worker/testing'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { runTurn } from './turnLoop'
import type { TurnDeps } from './turnLoop'
import { strictSchema } from './tools/types'
import type { AgentTool } from './tools/types'

/** Token counts in the shape a provider reports them. */
const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
}

/** A step that asks for one tool call. */
function callsTool(name: string, callId: string): unknown[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'tool-input-start', id: callId, toolName: name },
    { type: 'tool-input-delta', id: callId, delta: '{}' },
    { type: 'tool-input-end', id: callId },
    { type: 'tool-call', toolCallId: callId, toolName: name, input: '{}' },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage: USAGE },
  ]
}

/** A step that just answers. */
function answers(text: string): unknown[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: text },
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'end_turn' }, usage: USAGE },
  ]
}

/**
 * A model that plays the given steps back in order.
 *
 * Each call builds a fresh stream: a `ReadableStream` cannot be read twice,
 * so handing the same object to two steps would fail on the second.
 */
function mockModel(steps: unknown[][], onExhausted?: () => never): MockLanguageModelV4 {
  let step = 0
  return new MockLanguageModelV4({
    doStream: () => {
      const chunks = steps[step++]
      if (!chunks) {
        if (onExhausted) onExhausted()
        throw new Error('no more steps')
      }
      return Promise.resolve({
        stream: simulateReadableStream({
          chunks: chunks as never,
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      })
    },
  })
}

function fakeTool(name: string, mutates: boolean, run: () => { ok: true }): AgentTool {
  return { name, description: `${name} for tests`, parameters: strictSchema({}), mutates, run }
}

function setup() {
  const scene = fakeScene({ uid: 1, views: [fakeView({ uid: 2 })] })
  const pushMessage = vi.fn()
  const { ctx } = makeWorkerCtx({ scenes: [scene], extra: { svc: { pushMessage } } })
  return { scene, pushMessage, ctx: ctx as unknown as WorkerContext }
}

const MUTATING = 'set_mol_selection'
const READ_ONLY = 'get_named_selections'

function deps(model: MockLanguageModelV4): TurnDeps {
  return {
    createModel: () => model,
    tools: [
      fakeTool(MUTATING, true, () => ({ ok: true })),
      fakeTool(READ_ONLY, false, () => ({ ok: true })),
    ],
  }
}

const ARGS = {
  turnId: 't1',
  sceneId: 1,
  viewId: 2,
  userText: 'show chain A',
  history: [],
  apiKey: 'sk-test',
  model: 'openai:test-model',
  reasoningEffort: 'low' as const,
}

describe('an agent turn', () => {
  it('commits one transaction when a tool changed the scene', async () => {
    const { scene, pushMessage, ctx } = setup()
    const model = mockModel([callsTool(MUTATING, 'c1'), answers('Done.')])

    const result = await runTurn(ctx, ARGS, deps(model))

    expect(result.ok).toBe(true)
    expect(scene.undo.committed).toEqual(['AI: show chain A'])
    expect(scene.undo.rolledBack).toEqual([])
    if (result.ok) {
      expect(result.mutated).toBe(true)
      expect(result.toolCalls).toBe(1)
      expect(result.finalText).toBe('Done.')
      // The user message plus whatever the model produced, ready to replay.
      expect(result.appended[0]).toMatchObject({ role: 'user' })
      expect(result.appended.length).toBeGreaterThan(1)
    }

    // The provider is handed every tool, in strict mode: that is what makes
    // the arguments schema-valid before a tool ever sees them.
    const sent = model.doStreamCalls[0].tools ?? []
    expect(sent.map((t) => (t as { name: string }).name).sort()).toEqual([READ_ONLY, MUTATING].sort())
    expect(sent.every((t) => (t as { strict?: boolean }).strict === true)).toBe(true)

    // A result the panel cannot attach to a call is dropped, so the call has
    // to be announced first.
    const kinds = pushMessage.mock.calls
      .map((c) => (c[1] as { kind: string }).kind)
      .filter((k) => k === 'tool_call' || k === 'tool_result')
    expect(kinds).toEqual(['tool_call', 'tool_result'])
  })

  it('rolls back when the turn only read', async () => {
    const { scene, ctx } = setup()
    const model = mockModel([callsTool(READ_ONLY, 'c1'), answers('There are none.')])

    const result = await runTurn(ctx, ARGS, deps(model))

    expect(result.ok).toBe(true)
    // Committing here would clear the user's redo stack for a turn that
    // changed nothing.
    expect(scene.undo.committed).toEqual([])
    expect(scene.undo.rolledBack).toEqual(['AI: show chain A'])
  })

  it('still commits what a failing turn already changed', async () => {
    const { scene, ctx } = setup()
    // One step, then the provider goes away. Whether that surfaces as a
    // thrown error or an error part is the SDK's business; either way the
    // turn fails and the edit from step one has to stay.
    const model = mockModel([callsTool(MUTATING, 'c1')], () => {
      throw new Error('network down')
    })

    const result = await runTurn(ctx, ARGS, deps(model))

    expect(result.ok).toBe(false)
    // The selection the user watched appear stays; a rollback would revert it.
    expect(scene.undo.committed).toEqual(['AI: show chain A'])
    expect(scene.undo.rolledBack).toEqual([])
  })
})
