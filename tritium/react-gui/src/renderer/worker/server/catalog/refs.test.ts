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
  const node = (id: number, name: string, type: string, children: unknown[] = [], className = '') => ({ id, name, type, children, className })
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
            : args.sceneId === 3
              ? [
                  node(40, '1crn', 'object', [
                    node(41, '', 'renderer', [], '*selection'),
                    node(42, '', 'renderer', [], '*namelabel'),
                    node(43, 'simple1', 'renderer', [], 'simple'),
                    node(44, 'simple1', 'renderer', [], 'simple'),
                  ], 'MolCoord'),
                ]
              : args.sceneId === 4
                ? [node(50, '1ox1.pdb', 'object')]
                : [node(10, '1crn', 'object'), node(30, '1crn', 'object')],
      },
    }),
  }
})

import { expandPropPath, isWildcardRef, recordedPath, resolvePropPath, resolveRef, resolveRefs, sceneNodes } from './refs'

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

describe('recordedPath', () => {
  it('tells shared names apart by type, then uid, and the path finds its node again', () => {
    const nodes = sceneNodes(ctx, 3)
    const paths = [40, 41, 42, 43, 44].map((id) => recordedPath(nodes, id))
    expect(paths).toEqual(['1crn', '1crn/@*selection', '1crn/@*namelabel', '1crn/simple1@simple#43', '1crn/simple1@simple#44'])
    paths.forEach((p, i) => expect(resolveRef(ctx, 3, p as string, 'node')).toMatchObject({ ok: true, node: { id: 40 + i } }))
    expect(resolvePropPath(ctx, 3, '1crn/@*namelabel.visible')).toMatchObject({ ok: true, nodeId: 42, prop: 'visible' })
    // In another session the uid names none of them: still found when the rest is unique, refused when not.
    expect(resolveRef(ctx, 3, '1crn/@*selection#99', 'node')).toMatchObject({ ok: true, node: { id: 41 } })
    expect(resolveRef(ctx, 3, '1crn/simple1@simple#99', 'node').ok).toBe(false)
  })
})

describe('resolveRef with an object class', () => {
  // 1crn (10) is a MolCoord; 2abc (20) derives from one, which only the wrappers know.
  const classes: Record<number, string> = { 10: 'MolCoord', 20: 'AnimMol' }
  const classCtx = {
    sceMgr: { getScene: () => ({ getObject: (id: number) => ({ getClassName: () => classes[id] }) }) },
    svc: { isInstanceOf: (obj: { getClassName: () => string }, cls: string) => cls === 'MolCoord' && obj.getClassName() === 'AnimMol' },
  } as unknown as WorkerContext

  it('accepts the class or a derived one, and names the class when refusing', () => {
    expect(resolveRef(classCtx, 1, '1crn', 'object', 'MolCoord')).toMatchObject({ ok: true, node: { id: 10 } })
    expect(resolveRef(classCtx, 1, '2abc', 'object', 'MolCoord')).toMatchObject({ ok: true, node: { id: 20 } })
    expect(resolveRef(classCtx, 1, '1crn', 'object', 'DensityMap')).toEqual({ ok: false, error: '"1crn" is not a DensityMap object' })
  })
})

describe('a name pattern', () => {
  const ids = (sceneId: number, text: string, kind: 'object' | 'renderer' | 'node' = 'node') => {
    const res = resolveRefs(ctx, sceneId, text, kind)
    return res.ok ? res.nodes.map((n) => n.id) : res.error
  }

  it('matches names, not types, and reads a path as a plain name does', () => {
    // A bare pattern means objects; renderers only for a renderer parameter.
    expect(ids(1, '*')).toEqual([10, 20])
    expect(ids(1, '*', 'renderer')).toEqual([11, 12])
    expect(ids(1, '*/c?rtoon*')).toEqual([11])
    // The type is matched exactly (it may hold a `*`); an empty name then matches any.
    expect(ids(3, '*/@*selection')).toEqual([41])
    expect(ids(3, '1*/@simple')).toEqual([43, 44])
    expect(ids(1, 'zz*')).toEqual([])
    expect(typeof ids(1, '*#10')).toBe('string')
    // A bare wildcard in a name is a pattern; an escaped one, or one in a type, is not.
    expect([isWildcardRef('1c*'), isWildcardRef('1c\\*'), isWildcardRef('1crn/@*selection')]).toEqual([true, false, false])
  })

  it('in a property path covers the node part only', () => {
    const paths = (sceneId: number, text: string) => {
      const res = expandPropPath(ctx, sceneId, text)
      return res && (res.ok ? res.targets.map((t) => t.path) : res.error)
    }
    expect(paths(1, '*/cartoon1.width')).toEqual(['1crn/cartoon1.width'])
    expect(paths(1, '*.coloring.col_C')).toEqual(['1crn.coloring.col_C', '2abc.coloring.col_C'])
    // A pattern may match a dot: the longest prefix that names objects wins.
    expect(paths(4, '*.pdb.visible')).toEqual(['1ox1.pdb.visible'])
    // A wildcard in the property keeps its meaning, and a plain path is left to resolvePropPath.
    expect(paths(1, '1crn.*')).toBeNull()
    expect(paths(1, '1crn/cartoon1.width')).toBeNull()
  })
})
