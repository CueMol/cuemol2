/**
 * @file state/sceneTree/commands/useStyleCommands.ts
 * @description Handlers for the style-set entries of the scene-tree
 * context menu.
 *
 * A style set is addressed by its uid plus the scope it lives in, both
 * carried on the row, so these need nothing from the tree.
 */

import { IPC } from '@shared/ipcChannels'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { UseSceneTreeResult } from '@renderer/features/scene/useSceneTree'
import { useShowTextPromptDialog } from '@renderer/dialogs/TextPromptDialogProvider'
import { useShowStyleEditorDialog } from '@renderer/dialogs/StyleEditorDialogProvider'
import { useRegisterCommand } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'

export interface StyleCommandsOptions {
  cm: AsyncCueMol | null
  sceneId: number | undefined
  scene: UseSceneTreeResult
}

/** A never-saved style set has no name to offer the save dialog. */
const saveName = (name: string): string => (name === '(anonymous)' ? '' : name)

export function useStyleCommands({ cm, sceneId, scene }: StyleCommandsOptions): void {
  const showTextPrompt = useShowTextPromptDialog()
  const showStyleEditor = useShowStyleEditorDialog()

  useRegisterCommand(CmdId.StyleNew, async () => {
    // UXP `createStyle` walks "style_0", "style_1", ... until it finds a free
    // name then prompts; pre-fetch the same suggestion.
    let suggestion = 'style_0'
    if (cm && sceneId !== undefined) {
      try {
        const r = await cm.invokeService('proposeUniqName', {
          kind: 'styleSet', prefix: 'style', sceneId,
        })
        suggestion = r?.name ?? suggestion
      } catch (err) {
        console.warn('proposeUniqName failed:', err)
      }
    }
    const entered = await showTextPrompt({
      title: 'New Style',
      label: 'Name for new style:',
      defaultValue: suggestion,
      confirmLabel: 'Create',
    })
    if (entered == null) return
    await scene.createStyleSet(entered)
  })

  useRegisterCommand(CmdId.StyleEdit, async ({ id, scopeId, name }) => {
    if (sceneId === undefined) return
    await showStyleEditor({ styleSetId: Number(id), scopeId, sceneId, styleName: name })
  })

  useRegisterCommand(CmdId.StyleToggleReadOnly, async ({ id, scopeId }) => {
    await scene.toggleStyleSetReadOnly(Number(id), scopeId)
  })

  useRegisterCommand(CmdId.StyleLoadFromFile, async () => {
    const r = await window.electronAPI.invoke(IPC.DIALOG_STYLE_OPEN)
    if (r.canceled || !r.filePath) return
    await scene.loadStyleSetFromFile(r.filePath)
  })

  useRegisterCommand(CmdId.StyleReload, () => {
    // UXP's own `onStyReloadFile` reports "Not implemented"; mirror that
    // rather than inventing behaviour it never had.
    console.info('styleReload not implemented yet (matches UXP onStyReloadFile)')
  })

  useRegisterCommand(CmdId.StyleSave, async ({ id, scopeId, name }) => {
    const r = await scene.saveStyleSetToCurrentSrc(Number(id), scopeId)
    // A style set with no source file falls through to Save As, as in UXP.
    if (!r.ok || r.saved) return
    const save = await window.electronAPI.invoke(IPC.DIALOG_STYLE_SAVE, {
      defaultName: saveName(name),
    })
    if (save.canceled || !save.filePath) return
    await scene.saveStyleSetToFile(Number(id), scopeId, save.filePath)
  })

  useRegisterCommand(CmdId.StyleSaveAs, async ({ id, scopeId, name }) => {
    const save = await window.electronAPI.invoke(IPC.DIALOG_STYLE_SAVE, {
      defaultName: saveName(name),
    })
    if (save.canceled || !save.filePath) return
    await scene.saveStyleSetToFile(Number(id), scopeId, save.filePath)
  })
}
