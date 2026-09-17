/**
 * @file state/sceneTree/commands/useSceneNewFlows.ts
 * @description The "New Renderer..." flow.
 *
 * It has two entry points -- the context menu and the tree toolbar's Add
 * button, which UXP dispatched to the same flow by the selected row's type --
 * so it lives here rather than in either caller. The sibling "New Camera..."
 * flow moved to `features/camera` with the rest of the camera surface.
 */

import { useCallback } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { UseSceneTreeResult } from '@renderer/features/scene/useSceneTree'
import { findTypedNode } from '@renderer/hooks/sceneTree/sceneTreeNodeUtils'
import { useShowNewRendererDialog } from '@renderer/dialogs/NewRendererDialogProvider'

export interface SceneNewFlowsOptions {
  cm: AsyncCueMol | null
  sceneId: number | undefined
  scene: UseSceneTreeResult
}

export interface SceneNewFlows {
  /** New Renderer on an object / renderer / rendGroup row. */
  openNewRendererFlow: (nodeId: string) => Promise<void>
}

export function useSceneNewFlows({
  cm,
  sceneId,
  scene,
}: SceneNewFlowsOptions): SceneNewFlows {
  const showNewRenderer = useShowNewRendererDialog()

  // Mirrors UXP `onNewCmd`, which called the same `setupRendByObjID` from
  // both the ctxmenu item and the toolbar.
  const openNewRendererFlow = useCallback(
    async (nodeId: string): Promise<void> => {
      if (!cm || sceneId === undefined) return
      const found = findTypedNode(scene.tree, nodeId, 'object', 'renderer', 'rendGroup')
      if (!found) return
      let info
      try {
        info = await cm.invokeService('getNewRendererOptions', {
          sceneId,
          sourceNodeId: found.numId,
          // findTypedNode already narrowed the row to one of these three.
          sourceNodeType: found.node.type as 'object' | 'renderer' | 'rendGroup',
        })
      } catch (err) {
        console.warn('getNewRendererOptions failed:', err)
        return
      }
      if (!info?.ok || info.rendererTypes.length === 0) return
      const result = await showNewRenderer({
        sceneId,
        objName: info.objName,
        objClassName: info.objClassName,
        rendererTypes: info.rendererTypes,
        presetTypes: info.presetTypes ?? [],
        defaultName: info.defaultName,
        isMol: info.isMol,
        molID: info.isMol && info.targetObjId >= 0 ? info.targetObjId : undefined,
        currentSel: info.currentSel,
        groupName: info.groupName || undefined,
      })
      if (!result) return
      await scene.createRendererOnObject(
        info.targetObjId,
        result.rendOpts,
        info.groupName || undefined,
      )
    },
    [cm, sceneId, showNewRenderer, scene],
  )

  return { openNewRendererFlow }
}
