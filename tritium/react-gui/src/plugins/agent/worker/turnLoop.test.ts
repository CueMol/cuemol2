/**
 * @file plugins/agent/worker/turnLoop.test.ts
 * @description The undo-transaction contract of one agent turn.
 *
 * The rule the rest of the loop is built around: a turn that changed the
 * scene commits, whatever else happened to it, and a turn that only read
 * rolls back. Both halves matter and neither is visible from the outside --
 * committing an empty transaction silently clears the user's redo stack, and
 * rolling back a cancelled turn silently reverts changes they watched appear.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

// The snapshot reads the scene through C++ JSON the fakes do not model; the
// turn under test does not depend on what it says.
vi.mock('./sceneSnapshot', () => ({
  buildSceneSnapshot: () => ({ sceneId: 1, viewId: 2, objects: [], namedSelections: [] }),
  formatSceneSnapshot: () => '<scene_state>{}</scene_state>',
}))

const setMolSelection = vi.fn(() => ({ ok: true }))
const getNamedSelections = vi.fn(() => ({ ok: true, data: { global: [], scene: [] } }))

vi.mock('./tools/index', () => ({
  OPENAI_TOOLS: [],
  findTool: (name: string) => {
    if (name === 'set_mol_selection') {
      return { name, mutates: true, run: setMolSelection }
    }
    if (name === 'get_named_selections') {
      return { name, mutates: false, run: getNamedSelections }
    }
    return undefined
  },
}))

import { fakeScene, fakeView, makeWorkerCtx } from '@renderer/worker/testing'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { runTurn } from './turnLoop'
import type { AgentStreamEvent } from './openaiClient'

/** One streamed response, as the loop consumes it. */
function streamOf(events: AgentStreamEvent[]): AsyncIterable<AgentStreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event
    },
  }
}

/** A response that asks for one tool call. */
function callsTool(name: string, callId: string): AgentStreamEvent {
  return {
    type: 'response.completed',
    response: {
      status: 'completed',
      output: [{ type: 'function_call', name, arguments: '{}', call_id: callId }],
    },
  }
}

/** A response that just answers. */
function answers(text: string): AgentStreamEvent[] {
  return [
    { type: 'response.output_text.delta', delta: text },
    { type: 'response.completed', response: { status: 'completed', output: [] } },
  ]
}

function setup() {
  const scene = fakeScene({ uid: 1, views: [fakeView({ uid: 2 })] })
  const { ctx } = makeWorkerCtx({
    scenes: [scene],
    extra: { svc: { pushMessage: vi.fn() } },
  })
  return { scene, ctx: ctx as unknown as WorkerContext }
}

const ARGS = {
  turnId: 't1',
  sceneId: 1,
  viewId: 2,
  userText: 'show chain A',
  history: [],
  apiKey: 'sk-test',
  model: 'test-model',
  reasoningEffort: 'low' as const,
}

/** A client that plays the given rounds back in order. */
function fakeClient(rounds: AgentStreamEvent[][]) {
  let round = 0
  return {
    createClient: () => ({
      responses: {
        create: () => Promise.resolve(streamOf(rounds[round++] ?? [])),
      },
    }),
  }
}

describe('an agent turn', () => {
  it('commits one transaction when a tool changed the scene', async () => {
    const { scene, ctx } = setup()
    const result = await runTurn(
      ctx,
      ARGS,
      fakeClient([[callsTool('set_mol_selection', 'c1')], answers('Done.')]),
    )

    expect(result.ok).toBe(true)
    expect(scene.undo.committed).toEqual(['AI: show chain A'])
    expect(scene.undo.rolledBack).toEqual([])
    if (result.ok) {
      expect(result.mutated).toBe(true)
      expect(result.toolCalls).toBe(1)
      expect(result.finalText).toBe('Done.')
    }
  })

  it('rolls back when the turn only read', async () => {
    const { scene, ctx } = setup()
    const result = await runTurn(
      ctx,
      ARGS,
      fakeClient([[callsTool('get_named_selections', 'c1')], answers('There are none.')]),
    )

    expect(result.ok).toBe(true)
    // Committing here would clear the user's redo stack for a turn that
    // changed nothing.
    expect(scene.undo.committed).toEqual([])
    expect(scene.undo.rolledBack).toEqual(['AI: show chain A'])
  })

  it('still commits what a failing turn already changed', async () => {
    const { scene, ctx } = setup()
    const failing = {
      createClient: () => ({
        responses: {
          create: (() => {
            let round = 0
            return () => {
              if (round++ === 0) {
                return Promise.resolve(streamOf([callsTool('set_mol_selection', 'c1')]))
              }
              return Promise.reject(new Error('network down'))
            }
          })(),
        },
      }),
    }

    const result = await runTurn(ctx, ARGS, failing)

    expect(result.ok).toBe(false)
    // The selection the user watched appear stays; a rollback would revert it.
    expect(scene.undo.committed).toEqual(['AI: show chain A'])
    expect(scene.undo.rolledBack).toEqual([])
  })
})
