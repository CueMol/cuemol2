/**
 * @file state/sceneTree/commands/useSceneNodeCommands.ts
 * @description Handlers for the scene-tree node operations.
 *
 * These have several entry points -- the context menu, the tree toolbar, the
 * Edit menu and its shortcuts -- so each takes the ids to act on rather than
 * reading the selection itself. One handler, one behaviour, whichever way
 * the user got there.
 */

import type { UseSceneTreeResult } from '@renderer/hooks/useSceneTree'
import { findTypedNode } from '@renderer/hooks/sceneTree/sceneTreeNodeUtils'
import { useShowErrorAlert } from '@renderer/components/dialogs/ErrorAlertDialogProvider'
import { useRegisterCommand } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import { useInspectorActions, resolveNodeTarget } from '../../inspector'

export interface SceneNodeCommandsOptions {
  scene: UseSceneTreeResult
  /** Put a row into inline-rename mode (the editor lives in ScenePane). */
  beginInlineRename: (id: string) => void
}

export function useSceneNodeCommands({ scene, beginInlineRename }: SceneNodeCommandsOptions): void {
  const showErrorAlert = useShowErrorAlert()
  const { showNode } = useInspectorActions()

  // Show / Hide. A single row with no explicit flag toggles (the menu item is
  // labelled from the current state); a multi-selection is set outright, so
  // rows that disagree end up the same.
  useRegisterCommand(CmdId.SceneNodeSetVisible, async ({ ids, visible }) => {
    if (ids.length === 0) return
    if (visible === undefined) {
      for (const id of ids) scene.toggleVisibility(id)
      return
    }
    await scene.bulkSetNodeVisible(ids, visible)
  })

  // Delete. UXP drove its toolbar button through the same multi loop, so a
  // multi-selection goes under one undo transaction; a single row takes the
  // single-node path, which also covers cameras and styles.
  useRegisterCommand(CmdId.SceneNodeDelete, async ({ ids }) => {
    if (ids.length === 0) return
    if (ids.length > 1) {
      await scene.bulkDeleteNodes(ids)
      return
    }
    await scene.deleteNode(ids[0])
  })

  // Copy. `bulkCopyNodes` refuses a mixed set and multiple objects exactly as
  // UXP did; surface both refusals in its wording. The return value says
  // whether anything reached the clipboard -- Cut deletes only then, so a
  // refused copy never destroys the selection.
  useRegisterCommand(CmdId.SceneNodeCopy, async ({ ids }) => {
    if (ids.length === 0) return false
    if (ids.length > 1) {
      const res = await scene.bulkCopyNodes(ids)
      if (res.ok) return true
      if (res.reason === 'mixed') {
        await showErrorAlert({
          title: 'Copy',
          message: 'Multiple items with different types selected.',
        })
      } else if (res.reason === 'objectUnsupported') {
        await showErrorAlert({
          title: 'Copy',
          message: 'Multiple copy of object: not supported.',
        })
      }
      return false
    }
    const found = findTypedNode(scene.tree, ids[0])
    return found ? await scene.copyNode(found.node) : false
  })

  useRegisterCommand(CmdId.SceneNodePaste, async ({ targetId }) => {
    const found = findTypedNode(scene.tree, targetId)
    if (found) await scene.pasteNode(found.node)
  })

  useRegisterCommand(CmdId.SceneNodeRenameBegin, ({ id }) => {
    beginInlineRename(id)
  })

  // Open a row in the property inspector: the id is resolved against the live
  // tree here, so the inspector receives a target and never needs the tree.
  useRegisterCommand(CmdId.SceneNodeProperty, ({ id }) => {
    const target = resolveNodeTarget(scene.tree, id)
    if (target) showNode(target)
  })

  useRegisterCommand(CmdId.SceneNodeSelectMol, async ({ id, selectKind }) => {
    await scene.selectObjectMol(id, selectKind)
  })
}
