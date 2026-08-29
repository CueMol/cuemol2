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
} from '../../server/services/bulkSceneNodeOps.service'
import type {
  ReorderSceneNodeArgs,
  ReorderSceneNodeResult,
} from '../../server/services/reorderSceneNode.service'
import type {
  CopyNodeArgs,
  CopyNodeResult,
  CopyNodesArgs,
  CopyNodesResult,
  PasteNodeArgs,
  PasteNodeResult,
} from '../../server/services/sceneClipboard.service'
import type {
  DeleteNodeArgs,
  DeleteNodeResult,
  FocusOnNodeArgs,
  FocusOnNodeResult,
  RenameNodeArgs,
  RenameNodeResult,
} from '../../server/services/sceneOps.service'
import type {
  GetSceneTreeArgs,
  GetSceneTreeResult,
  SetNodeUiCollapsedArgs,
  SetNodeUiCollapsedResult,
  SetNodeVisibleArgs,
  SetNodeVisibleResult,
} from '../../server/services/sceneTree.service'

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
