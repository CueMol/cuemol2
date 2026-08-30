/**
 * @file state/sceneTree/commands/useRendererCommands.ts
 * @description Handlers for the renderer and object entries of the
 * scene-tree context menu.
 *
 * The ones that open a dialog re-read what they need from the worker rather
 * than trusting the menu payload: the scene can change while the menu is
 * open, and the dialogs want more than the menu carried anyway.
 */

import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { UseSceneTreeResult } from '@renderer/features/scene/useSceneTree'
import { findTypedNode } from '@renderer/hooks/sceneTree/sceneTreeNodeUtils'
import { useShowTextPromptDialog } from '@renderer/dialogs/TextPromptDialogProvider'
import { useShowApplyRendStyleDialog } from '@renderer/dialogs/ApplyRendStyleDialogProvider'
import { useShowCreateRendStyleDialog } from '@renderer/dialogs/CreateRendStyleDialogProvider'
import { useShowEditInteractionListDialog } from '@renderer/dialogs/EditInteractionListDialogProvider'
import { useShowRegenMolSurfDialog } from '@renderer/dialogs/RegenMolSurfDialogProvider'
import { useRegisterCommand } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'

export interface RendererCommandsOptions {
  cm: AsyncCueMol | null
  sceneId: number | undefined
  scene: UseSceneTreeResult
  /** The shared "New Renderer..." flow, also run by the toolbar Add button. */
  openNewRendererFlow: (nodeId: string) => Promise<void>
}

export function useRendererCommands({
  cm,
  sceneId,
  scene,
  openNewRendererFlow,
}: RendererCommandsOptions): void {
  const showTextPrompt = useShowTextPromptDialog()
  const showApplyRendStyle = useShowApplyRendStyleDialog()
  const showCreateRendStyle = useShowCreateRendStyleDialog()
  const showEditInteractionList = useShowEditInteractionListDialog()
  const showRegenMolSurf = useShowRegenMolSurfDialog()

  useRegisterCommand(CmdId.RendererNew, ({ sourceNodeId }) => openNewRendererFlow(sourceNodeId))

  useRegisterCommand(CmdId.RendererSetColoring, async ({ id, coloringId }) => {
    await scene.setRendererColoring(id, coloringId)
  })

  // UXP `ws.onPaintMol` is shared between the object and renderer Paint
  // menus, so this branches on the row type.
  useRegisterCommand(CmdId.RendererPaint, async ({ id, colorValue }) => {
    const found = findTypedNode(scene.tree, id, 'object', 'renderer')
    if (!found) return
    if (found.node.type === 'object') await scene.paintObjectSelection(id, colorValue)
    else await scene.paintRendererSelection(id, colorValue)
  })

  useRegisterCommand(CmdId.RendererApplyStyle, async ({ id, styleName, pattern, flags }) => {
    await scene.applyRendererStyle(id, styleName, pattern, flags)
  })

  useRegisterCommand(CmdId.RendererSetSelection, async ({ id, selKind }) => {
    await scene.setRendererSelection(id, selKind)
  })

  useRegisterCommand(CmdId.RendererGenSurfObj, async ({ id }) => {
    await scene.generateRendererSurfObj(id)
  })

  useRegisterCommand(CmdId.RendererChangeType, async ({ id, typeName }) => {
    await scene.changeRendererType(id, typeName)
  })

  useRegisterCommand(CmdId.RendererEditStyle, async ({ id }) => {
    if (!cm || sceneId === undefined) return
    const rendId = Number(id)
    let info
    try {
      info = await cm.invokeService('getRendererStyleEditInfo', { sceneId, rendId })
    } catch (err) {
      console.warn('getRendererStyleEditInfo failed:', err)
      return
    }
    if (!info?.ok) return
    const result = await showApplyRendStyle({
      rendName: info.rendName,
      rendTypeName: info.rendTypeName,
      initialStyles: info.currentStyles,
      typeMatch: info.typeMatch,
      edgeMatch: info.edgeMatch,
      coloringMatch: info.coloringMatch,
    })
    if (!result) return
    try {
      await cm.invokeService('applyRendererStyleList', {
        sceneId, rendId, styleNames: result.styleNames,
      })
    } catch (err) {
      console.warn('applyRendererStyleList failed:', err)
    }
  })

  useRegisterCommand(CmdId.RendererCreateStyle, async ({ id }) => {
    if (!cm || sceneId === undefined) return
    const rendId = Number(id)
    let info
    try {
      info = await cm.invokeService('getCreateRendStyleInfo', { sceneId, rendId })
    } catch (err) {
      console.warn('getCreateRendStyleInfo failed:', err)
      return
    }
    if (!info?.ok) return
    const result = await showCreateRendStyle({
      rendName: info.rendName,
      rendTypeName: info.rendTypeName,
      styleSets: info.styleSets,
      defaultSelectedUid: info.defaultSelectedUid,
    })
    if (!result) return
    try {
      await cm.invokeService('createStyleFromRenderer', {
        sceneId, rendId, setUid: result.setUid, baseName: result.baseName,
      })
    } catch (err) {
      console.warn('createStyleFromRenderer failed:', err)
    }
  })

  useRegisterCommand(CmdId.RendererEditIntrList, async ({ id, rendName }) => {
    if (!cm || sceneId === undefined) return
    const rendId = Number(id)
    let info
    try {
      info = await cm.invokeService('listAtomIntrDefs', { sceneId, rendId })
    } catch (err) {
      console.warn('listAtomIntrDefs failed:', err)
      return
    }
    if (!info?.ok) return
    const result = await showEditInteractionList({ rendName, entries: info.entries })
    if (!result || result.removeIds.length === 0) return
    try {
      await cm.invokeService('removeAtomIntrDefs', { sceneId, rendId, ids: result.removeIds })
    } catch (err) {
      console.warn('removeAtomIntrDefs failed:', err)
    }
  })

  useRegisterCommand(CmdId.RendererNewGroup, async ({ objId }) => {
    // Pre-fetch a scene-wide-unique default name so the prompt matches UXP
    // `onNewRendGrp` (suggested name pre-filled).
    let suggestion = 'group1'
    if (cm && sceneId !== undefined) {
      try {
        const r = await cm.invokeService('proposeUniqName', {
          kind: 'sceneRenderer', prefix: 'group', sceneId,
        })
        suggestion = r?.name ?? suggestion
      } catch (err) {
        console.warn('proposeUniqName failed:', err)
      }
    }
    const entered = await showTextPrompt({
      title: 'New Renderer Group',
      label: 'Name for new group:',
      defaultValue: suggestion,
      confirmLabel: 'Create',
    })
    if (entered == null) return
    await scene.createRendererGroup(objId, entered)
  })

  useRegisterCommand(CmdId.ObjectRegenSurface, async ({ objId }) => {
    if (!cm || sceneId === undefined) return
    // Re-read the origin-molecule state rather than trusting the menu
    // payload: the scene may have changed while the menu was open, and the
    // dialog needs orig_den / orig_prad / orig_sel to prefill anyway.
    const info = await cm.invokeService('getMolSurfRegenInfo', {
      sceneId, objId: Number(objId),
    })
    if (!info?.canRegen) return
    await showRegenMolSurf({
      sceneId,
      objId: Number(objId),
      objName: info.objName,
      origMol: info.origMol,
      selStr: info.selStr,
      density: info.density,
      probeRadius: info.probeRadius,
    })
  })
}
