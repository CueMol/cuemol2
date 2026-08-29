/**
 * @file state/inspector/resolveNodeTarget.ts
 * @description Turn a scene-tree row id into an inspector target.
 *
 * The tree carries the two things the property bridge needs beyond the id:
 * the node type (which decides the C++ getter) and the scene the row lives
 * in (the tree root). Synthetic rows (camera / style roots, negative ids) and
 * ids that are not in the tree resolve to null; the inspector never opens on
 * those.
 */

import type { SceneTreeNode } from '../../worker/shared/sceneTreeTypes'
import { findTypedNode } from '../../hooks/sceneTree/sceneTreeNodeUtils'
import type { NodeTarget } from './InspectorProvider'

export function resolveNodeTarget(tree: SceneTreeNode | null, id: string): NodeTarget | null {
  if (!tree) return null
  const found = findTypedNode(tree, id)
  if (!found) return null
  const { numId, node } = found
  if (
    node.type !== 'scene' && node.type !== 'object' &&
    node.type !== 'renderer' && node.type !== 'rendGroup'
  ) {
    return null
  }
  return { kind: 'node', sceneId: Number(tree.id), nodeId: numId, nodeType: node.type }
}
