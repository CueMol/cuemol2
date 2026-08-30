/**
 * @file hooks/sceneTree/sceneTreeNodeUtils.ts
 * @description Shared tree-lookup helpers for the useSceneTree domain hooks.
 *
 * `findNode` walks the live scene tree by C++ uid. `findTypedNode` folds the
 * `Number()` parse + `findNode` + node-type check that every id-keyed action
 * callback repeated, returning both the parsed uid and the resolved node.
 * `findParentNode` answers "what does this row hang off", which is what a
 * sibling-relative action (paste next to me) needs.
 */

import type {
    SceneNodeType,
    SceneTreeNode,
} from '@renderer/worker/shared/sceneTreeTypes'

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
 * Depth-first lookup of a node's PARENT by the child's C++ uid. Returns null
 * for the root (and for an id that is not in the tree).
 */
export function findParentNode(
    root: SceneTreeNode | null,
    id: number,
): SceneTreeNode | null {
    if (!root) return null
    for (const child of root.children) {
        if (child.id === id) return root
        const found = findParentNode(child, id)
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
