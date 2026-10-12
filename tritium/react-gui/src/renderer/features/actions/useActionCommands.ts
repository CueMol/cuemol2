/**
 * @file features/actions/useActionCommands.ts
 * @description Handlers for the Action history commands, wherever they are
 * raised from (the pane's toolbar, keys, context menu).
 *
 * Showing a step in the inspector never moves the undo stack; GoToStep is
 * the one command that does, and it is offered only as an explicit button or
 * menu item, never on a double-click.
 */

import { IPC } from '@shared/ipcChannels'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from '@renderer/commands/commandTypes'
import { useRegisterCommand } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import { useInspectorActions } from '@renderer/state/inspector'
import { useUndoRedo } from '@renderer/state/undoRedo'
import { useShowErrorAlert } from '@renderer/dialogs/ErrorAlertDialogProvider'
import { actionStepLines, exportActionSteps, getActionSteps } from './actionOps'
import { goToStep } from './goToStep'

export interface ActionCommandsOptions {
  cm: AsyncCueMol | null
  getActiveSceneInfo: ActiveSceneCommandDeps
}

export function useActionCommands({ cm, getActiveSceneInfo }: ActionCommandsOptions): void {
  const { showActionStep } = useInspectorActions()
  const { pickUndo, pickRedo } = useUndoRedo()
  const showErrorAlert = useShowErrorAlert()

  useRegisterCommand(CmdId.ActionsShowStep, ({ stepId, entryIndex }) => {
    const info = getActiveSceneInfo()
    if (info) showActionStep(info.scene_uid, stepId, entryIndex)
  })

  useRegisterCommand(CmdId.ActionsGoToStep, async ({ stepId }) => {
    const info = getActiveSceneInfo()
    if (!info) return
    // Read the steps afresh: the pane's copy may be a refresh behind.
    const move = goToStep(await getActionSteps(cm, info.scene_uid), stepId)
    if (!move) return
    if (move.kind === 'undo') pickUndo(move.depth)
    else pickRedo(move.depth)
  })

  useRegisterCommand(CmdId.ActionsSave, async ({ stepIds }) => {
    const info = getActiveSceneInfo()
    if (!cm || !info || stepIds.length === 0) return
    const save = await window.electronAPI.invoke(IPC.DIALOG_ACTIONS_SAVE, { defaultName: 'actions.qax' })
    if (save.canceled || !save.filePath) return
    const problem = await exportActionSteps(cm, info.scene_uid, stepIds, save.filePath)
    if (problem !== null) await showErrorAlert({ title: 'Save Actions', message: problem })
  })

  useRegisterCommand(CmdId.ActionsCopy, async ({ stepIds }) => {
    const info = getActiveSceneInfo()
    if (!cm || !info || stepIds.length === 0) return false
    const text = await actionStepLines(cm, info.scene_uid, stepIds)
    if (text === null || !navigator.clipboard) return false
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      console.warn('copy actions failed:', err)
      return false
    }
  })
}
