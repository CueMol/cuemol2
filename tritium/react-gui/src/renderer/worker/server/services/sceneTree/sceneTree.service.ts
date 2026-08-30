/**
 * @file worker/server/services/sceneTree/sceneTree.service.ts
 * @description The scene tree: the registry entry.
 *
 * What the tree pane needs: the tree itself, the operations on a node, the
 * bulk form of those operations for a multi-selection, and reordering.
 */

import { bulkDeleteNode, bulkSetNodeVisible } from './bulkSceneNodeOps';
import { reorderSceneNode } from './reorderSceneNode';
import { deleteNode, focusOnNode, renameNode } from './sceneOps';
import { getSceneTree, setNodeUiCollapsed, setNodeVisible } from './sceneTree';

export const services = {
    bulkSetNodeVisible,
    bulkDeleteNode,
    reorderSceneNode,
    focusOnNode,
    deleteNode,
    renameNode,
    getSceneTree,
    setNodeVisible,
    setNodeUiCollapsed,
};

export type * from './bulkSceneNodeOps';
export type * from './reorderSceneNode';
export type * from './sceneOps';
export type * from './sceneTree';
