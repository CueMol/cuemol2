/**
 * @file features/scene/useSceneContextMenu.ts
 * @description Opens the scene-tree context menu and runs what the user
 * picked.
 *
 * Three steps and nothing else: build the payload the menu needs
 * (`buildSceneCtxPayload`), show it, and turn the action it returns into a
 * command (`sceneCtxActionToCommand`) to dispatch. The work itself lives in
 * the command handlers, which the tree toolbar and the keyboard reach the
 * same way -- so an entry that gains a second entry point cannot drift.
 */

import { useCallback } from 'react'
import type { SceneCtxAction, SceneCtxMenuPayload } from '@shared/types/sceneCtxMenu'
import { IPC } from '@shared/ipcChannels'
import { buildTemplate } from '@shared/sceneCtxMenu/sceneCtxTemplates'
import { useShowContextMenu } from '@renderer/shell/menu/ContextMenuProvider'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import { useCommands } from '@renderer/commands/CommandRegistry'
import { sceneCtxActionToCommand } from '@renderer/state/sceneTree/commands/sceneCtxActionToCommand'
import { buildSceneCtxPayload, nodeMenuLabel } from '@renderer/hooks/sceneContextMenu/buildSceneCtxPayload'

export interface UseSceneContextMenuOptions {
  cm: AsyncCueMol | null
  /** Active scene UID -- required to pre-fetch dynamic Paint(SS) styles. */
  sceneId: number | undefined
  /**
   * Current multi-select set. A right-click on a member of a set of more
   * than one raises the multi menu instead of the per-type one.
   */
  selectedIds?: Set<string>
}

export function useSceneContextMenu(opts: UseSceneContextMenuOptions): {
  openContextMenu: (node: SceneTreeNode, x: number, y: number) => Promise<void>
} {
  const { cm, sceneId, selectedIds } = opts
  const showContextMenu = useShowContextMenu()
  const { dispatch } = useCommands()

  // macOS shows the native menu (main process); Windows / Linux render the
  // same shared template with the React MenuPanel so the look matches the
  // menu bar dropdowns.
  const showSceneCtxMenu = useCallback(
    async (payload: SceneCtxMenuPayload): Promise<SceneCtxAction | null> => {
      const api = window.electronAPI
      if (api?.platform === 'darwin') {
        return await api.invoke(IPC.SCENE_CTX_SHOW, payload)
      }
      return await showContextMenu(buildTemplate(payload), { x: payload.x, y: payload.y })
    },
    [showContextMenu],
  )

  const openContextMenu = useCallback(
    async (node: SceneTreeNode, x: number, y: number): Promise<void> => {
      const idStr = String(node.id)

      // Multi-select right-click: when the targeted node is part of a
      // multi-select set, send the multi payload and skip the per-type
      // pre-fetch -- the menu offers only Show / Hide / Copy / Delete.
      const isMulti = !!selectedIds && selectedIds.size > 1 && selectedIds.has(idStr)
      const payload: SceneCtxMenuPayload = isMulti
        ? {
            x, y,
            nodeType: node.type,
            nodeLabel: nodeMenuLabel(node),
            isVisible: node.visible,
            hasVisibility: false,
            clipboardKind: null,
            multiNodeIds: [...selectedIds!].map(Number),
          }
        : { x, y, ...(await buildSceneCtxPayload(cm, sceneId, node)) }

      const action = await showSceneCtxMenu(payload)
      if (!action) return
      const invocation = sceneCtxActionToCommand(node, action, selectedIds)
      // An action that does not apply to this row resolves to nothing.
      if (!invocation) return
      await dispatch(invocation.id, ...(invocation.args === undefined ? [] : [invocation.args]) as [never])
    },
    [cm, sceneId, selectedIds, showSceneCtxMenu, dispatch],
  )

  return { openContextMenu }
}
