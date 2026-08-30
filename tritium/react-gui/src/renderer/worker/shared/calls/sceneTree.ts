/**
 * @file worker/shared/calls/sceneTree.ts
 * @description ServiceMap slice: the Explorer tree: visibility, rename, delete, reorder, clipboard.
 *
 * One row per registered worker service. `SCENE_TREE_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  BulkDeleteArgs,
  BulkOpResult,
  BulkSetVisibleArgs,
} from '@renderer/worker/server/services/sceneTree/bulkSceneNodeOps'
import type {
  ReorderSceneNodeArgs,
  ReorderSceneNodeResult,
} from '@renderer/worker/server/services/sceneTree/reorderSceneNode'
import type {
  CopyNodeArgs,
  CopyNodeResult,
  CopyNodesArgs,
  CopyNodesResult,
  PasteNodeArgs,
  PasteNodeResult,
} from '@renderer/worker/server/services/clipboard/clipboard.service'
import type {
  DeleteNodeArgs,
  DeleteNodeResult,
  FocusOnNodeArgs,
  FocusOnNodeResult,
  RenameNodeArgs,
  RenameNodeResult,
} from '@renderer/worker/server/services/sceneTree/sceneOps'
import type {
  GetSceneTreeArgs,
  GetSceneTreeResult,
  SetNodeUiCollapsedArgs,
  SetNodeUiCollapsedResult,
  SetNodeVisibleArgs,
  SetNodeVisibleResult,
} from '@renderer/worker/server/services/sceneTree/sceneTree'

export interface SceneTreeCalls {
  getSceneTree:               { args: GetSceneTreeArgs; result: GetSceneTreeResult }
  setNodeVisible:             { args: SetNodeVisibleArgs; result: SetNodeVisibleResult }
  setNodeUiCollapsed:         { args: SetNodeUiCollapsedArgs; result: SetNodeUiCollapsedResult }
  focusOnNode:                { args: FocusOnNodeArgs; result: FocusOnNodeResult }
  deleteNode:                 { args: DeleteNodeArgs; result: DeleteNodeResult }
  renameNode:                 { args: RenameNodeArgs; result: RenameNodeResult }
  copyNode:                   { args: CopyNodeArgs; result: CopyNodeResult }
  copyNodes:                  { args: CopyNodesArgs; result: CopyNodesResult }
  pasteNode:                  { args: PasteNodeArgs; result: PasteNodeResult }
  reorderSceneNode:           { args: ReorderSceneNodeArgs; result: ReorderSceneNodeResult }
  bulkSetNodeVisible:         { args: BulkSetVisibleArgs; result: BulkOpResult }
  bulkDeleteNode:             { args: BulkDeleteArgs; result: BulkOpResult }
}

export const SCENE_TREE_KEYS = [
  'getSceneTree',
  'setNodeVisible',
  'setNodeUiCollapsed',
  'focusOnNode',
  'deleteNode',
  'renameNode',
  'copyNode',
  'copyNodes',
  'pasteNode',
  'reorderSceneNode',
  'bulkSetNodeVisible',
  'bulkDeleteNode',
] as const satisfies readonly (keyof SceneTreeCalls)[]
