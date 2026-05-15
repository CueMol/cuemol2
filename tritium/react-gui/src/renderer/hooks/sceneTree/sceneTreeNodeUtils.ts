/**
 * @file hooks/sceneTree/sceneTreeNodeUtils.ts
 * @description Shared tree-lookup helpers for the useSceneTree domain hooks.
 *
 * `findNode` walks the live scene tree by C++ uid. `findTypedNode` folds the
 * `Number()` parse + `findNode` + node-type check that every id-keyed action
 * callback repeated, returning both the parsed uid and the resolved node.
 */

import type {
    SceneNodeType,
    SceneTreeNode,
} from '../../worker/shared/sceneTreeTypes'
import type { NodeInfoEntry } from '../../worker/server/services/sceneOps.service'

/** Resolved property info for the property dialog. */
export interface NodeInfo {
    title: string
    entries: NodeInfoEntry[]
}

/** Depth-first lookup of a node by its C++ uid. */
export function findNode(
    root: SceneTreeNode | null,
    id: number,
): SceneTreeNode | null {
    if (!root) return null
    if (root.id === id) return root
    for (const child of root.children) {
        const found = findNode(child, id)
        if (found) return found
    }
    return null
}

/**
 * Parse `id`, look it up in `tree`, and (when `types` is non-empty) check
 * the node type. Returns `{ numId, node }` on success, or `null` if the id
 * is not finite, the node is missing, or its type is not in `types`.
 */
export function findTypedNode(
    tree: SceneTreeNode | null,
    id: string,
    ...types: SceneNodeType[]
): { numId: number; node: SceneTreeNode } | null {
    const numId = Number(id)
    if (!Number.isFinite(numId)) return null
    const node = findNode(tree, numId)
    if (!node) return null
    if (types.length > 0 && !types.includes(node.type)) return null
    return { numId, node }
}
