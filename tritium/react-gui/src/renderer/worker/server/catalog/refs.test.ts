/**
 * @file worker/server/catalog/refs.test.ts
 * @description How a typed name or property path finds its node.
 *
 * A console user names things; an op takes uids. Getting the split wrong is
 * silent -- a renderer property written to its object, or a duplicated
 * name quietly picking one of two molecules, writes to the wrong node.
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

/** Two objects named 1crn (uids 10, 30), one with renderers, and one 2abc. */
vi.mock('@renderer/worker/server/services/sceneTree/sceneTree', () => {
  const node = (id: number, name: string, type: string, children: unknown[] = []) => ({ id, name, type, children })
  return {
    getSceneTree: (_ctx: unknown, args: { sceneId: number }) => ({
      ok: true,
      tree: {
        children:
          args.sceneId === 1
            ? [
                node(10, '1crn', 'object', [node(11, 'cartoon1', 'renderer'), node(12, 'grp', 'rendGroup')]),
                node(20, '2abc', 'object'),
              ]
            : [node(10, '1crn', 'object'), node(30, '1crn', 'object')],
      },
    }),
  }
})

import { resolvePropPath, resolveRef } from './refs'

const ctx = {} as WorkerContext

describe('resolvePropPath', () => {
  it('splits a path into the node and the (possibly nested) property', () => {
    expect(resolvePropPath(ctx, 1, '1crn/cartoon1.width')).toEqual({ ok: true, nodeType: 'renderer', nodeId: 11, prop: 'width' })
    expect(resolvePropPath(ctx, 1, '1crn/cartoon1.coloring.col_C')).toMatchObject({ nodeId: 11, prop: 'coloring.col_C' })
    // A group is a renderer to the property bridge.
    expect(resolvePropPath(ctx, 1, '1crn/grp.visible')).toMatchObject({ nodeType: 'renderer', nodeId: 12 })
    // A dot never reaches a renderer: the separator is `/`.
    expect(resolvePropPath(ctx, 1, '1crn.cartoon1.width')).toMatchObject({ nodeType: 'object', nodeId: 10, prop: 'cartoon1.width' })
    expect(resolvePropPath(ctx, 1, '1crn.visible')).toEqual({ ok: true, nodeType: 'object', nodeId: 10, prop: 'visible' })
    // No object prefix: the scene's own property.
    expect(resolvePropPath(ctx, 1, 'bgcolor')).toEqual({ ok: true, nodeType: 'scene', nodeId: 1, prop: 'bgcolor' })
    // `view.` is the caller's view.
    expect(resolvePropPath(ctx, 1, 'view.stereoMode', 7)).toEqual({ ok: true, nodeType: 'view', nodeId: 7, prop: 'stereoMode' })
  })

  it('refuses a duplicated object name instead of picking one', () => {
    const res = resolvePropPath(ctx, 2, '1crn.visible')
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toContain('#10, #30')
    expect(resolveRef(ctx, 2, '1crn', 'object').ok).toBe(false)
    expect(resolveRef(ctx, 2, '#30', 'object')).toMatchObject({ ok: true, node: { id: 30 } })
  })
})
