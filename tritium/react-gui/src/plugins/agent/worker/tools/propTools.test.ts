/**
 * @file plugins/agent/worker/tools/propTools.test.ts
 * @description Addressing the scene itself, which has no id to pass.
 *
 * Every other node the model touches is named by a uid out of the scene
 * snapshot. The scene is the exception: the turn fixes which scene it is, so
 * the tool substitutes the turn's id rather than take one. The risk that
 * creates is the mirror case -- a node that does need an id must not quietly
 * fall through to the scene and write the wrong thing.
 */

import { describe, it, expect, vi } from 'vitest'
import { fakeScene, makeWorkerCtx } from '@renderer/worker/testing'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { findTool } from './index'
import type { TurnContext } from './types'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

/** The shape C++ `getPropsJSON()` returns, cut down to what is asserted. */
const SCENE_PROPS = [
  {
    name: 'bgcolor',
    readonly: false,
    hasdefault: true,
    isdefault: false,
    type: 'object<AbstractColor$>',
    value: '#000000',
  },
  { name: 'aoEnabled', readonly: false, hasdefault: true, isdefault: true, type: 'boolean', value: false },
  { name: 'src', readonly: true, hasdefault: false, type: 'string', value: '' },
]

function setup() {
  const written: Record<string, unknown> = {}
  const scene = fakeScene({
    extra: {
      getPropsJSON: () => JSON.stringify(SCENE_PROPS),
      setProp: vi.fn((key: string, value: unknown) => {
        written[key] = value
      }),
      resetProp: vi.fn(),
      hasProp: (key: string) => SCENE_PROPS.some((p) => p.name === key),
    },
  })
  const { ctx } = makeWorkerCtx({ scenes: [scene] })
  const turn = { sceneId: scene.uid, viewId: 7 } as unknown as TurnContext
  return { scene, ctx: ctx as WorkerContext, turn, written }
}

describe('set_node_prop', () => {
  it('writes a scene property against the turn scene, with no id supplied', async () => {
    const { scene, ctx, turn, written } = setup()

    const outcome = await findTool('set_node_prop')!.run(
      ctx,
      { nodeType: 'scene', nodeId: null, prop: 'bgcolor', value: 'white' },
      turn,
    )

    expect(outcome.ok).toBe(true)
    expect(written.bgcolor).toBe('white')
    // One undo step, so the turn's transaction reverts the change with it.
    expect(scene.undo.committed).toEqual(['Change property: bgcolor'])
  })

  it('refuses a renderer with no id instead of falling back to the scene', async () => {
    const { scene, ctx, turn, written } = setup()

    const outcome = await findTool('set_node_prop')!.run(
      ctx,
      { nodeType: 'renderer', nodeId: null, prop: 'bgcolor', value: 'white' },
      turn,
    )

    expect(outcome.ok).toBe(false)
    expect(written).toEqual({})
    expect(scene.undo.started).toEqual([])
  })
})
