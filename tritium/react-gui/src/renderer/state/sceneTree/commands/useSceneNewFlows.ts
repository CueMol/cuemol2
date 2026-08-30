/**
 * @file state/sceneTree/commands/useSceneNewFlows.ts
 * @description The "New Renderer..." and "New Camera..." flows.
 *
 * Both have two entry points -- the context menu and the tree toolbar's Add
 * button, which UXP dispatched to the same two flows by the selected row's
 * type -- so they live here rather than in either caller.
 */

import { useCallback } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { UseSceneTreeResult } from '@renderer/features/scene/useSceneTree'
import { findTypedNode } from '@renderer/hooks/sceneTree/sceneTreeNodeUtils'
import { useShowTextPromptDialog } from '@renderer/dialogs/TextPromptDialogProvider'
import { useShowNewRendererDialog } from '@renderer/dialogs/NewRendererDialogProvider'

export interface SceneNewFlowsOptions {
  cm: AsyncCueMol | null
  sceneId: number | undefined
  activeViewId: number | undefined
  scene: UseSceneTreeResult
}

export interface SceneNewFlows {
  /** New Renderer on an object / renderer / rendGroup row. */
  openNewRendererFlow: (nodeId: string) => Promise<void>
  /** New Camera from the live view. */
  openNewCameraFlow: () => Promise<void>
}

export function useSceneNewFlows({
  cm,
  sceneId,
  activeViewId,
  scene,
}: SceneNewFlowsOptions): SceneNewFlows {
  const showTextPrompt = useShowTextPromptDialog()
  const showNewRenderer = useShowNewRendererDialog()

  // Mirrors UXP `onNewCmd` (camera / cameraRoot branch).
  const openNewCameraFlow = useCallback(async (): Promise<void> => {
    if (activeViewId === undefined || sceneId === undefined) return
    let suggestion = 'camera_0'
    if (cm) {
      try {
        const r = await cm.invokeService('proposeUniqName', {
          kind: 'camera', prefix: 'camera', sceneId,
        })
        suggestion = r?.name ?? suggestion
      } catch (err) {
        console.warn('proposeUniqName failed:', err)
      }
    }
    const entered = await showTextPrompt({
      title: 'New Camera',
      label: 'Name for new camera:',
      defaultValue: suggestion,
      confirmLabel: 'Create',
    })
    if (entered == null) return
    await scene.createCamera(activeViewId, entered)
  }, [cm, sceneId, activeViewId, showTextPrompt, scene])

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

  return { openNewRendererFlow, openNewCameraFlow }
}
