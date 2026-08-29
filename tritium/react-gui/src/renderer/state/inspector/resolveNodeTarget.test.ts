/**
 * @file state/inspector/resolveNodeTarget.test.ts
 * @description What a scene-tree row id resolves to for the inspector.
 */

import { describe, it, expect } from 'vitest'
import type { SceneTreeNode } from '../../worker/shared/sceneTreeTypes'
import { resolveNodeTarget } from './resolveNodeTarget'

const node = (partial: Partial<SceneTreeNode>): SceneTreeNode =>
  ({ children: [], ...partial }) as SceneTreeNode

const tree = node({
  id: 1, type: 'scene', name: 'S',
  children: [
    node({ id: 10, type: 'object', name: 'mol', children: [node({ id: 11, type: 'renderer', name: 'rib' })] }),
    node({ id: 12, type: 'rendGroup', name: 'grp' }),
    node({ id: -1, type: 'cameraRoot', name: 'Cameras', children: [node({ id: -3, type: 'camera', name: 'cam1' })] }),
    node({ id: -2, type: 'styleRoot', name: 'Styles', children: [node({ id: -4, type: 'style', name: 'st' })] }),
  ],
})

describe('resolveNodeTarget', () => {
  it('resolves a property-bridge row to its scene, id and type', () => {
    expect(resolveNodeTarget(tree, '11')).toEqual({ kind: 'node', sceneId: 1, nodeId: 11, nodeType: 'renderer' })
    expect(resolveNodeTarget(tree, '10')).toEqual({ kind: 'node', sceneId: 1, nodeId: 10, nodeType: 'object' })
    expect(resolveNodeTarget(tree, '12')).toEqual({ kind: 'node', sceneId: 1, nodeId: 12, nodeType: 'rendGroup' })
    // The scene row's node id is its own uid.
    expect(resolveNodeTarget(tree, '1')).toEqual({ kind: 'node', sceneId: 1, nodeId: 1, nodeType: 'scene' })
  })

  it('does not resolve cameras, styles, the synthetic roots, or unknown ids', () => {
    for (const id of ['-1', '-2', '-3', '-4', '999', '', 'abc']) {
      expect(resolveNodeTarget(tree, id)).toBeNull()
    }
    expect(resolveNodeTarget(null, '11')).toBeNull()
  })
})
