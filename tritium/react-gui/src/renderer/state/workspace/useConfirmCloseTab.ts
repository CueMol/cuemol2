/**
 * @file state/workspace/useConfirmCloseTab.ts
 * @description The "save changes?" gate a molview tab passes through before
 * it closes.
 *
 * Asks only when the tab is the LAST view of a modified scene; a second view
 * of the same scene can go without a prompt. 'save' runs the FileSave
 * command and the close proceeds only if it succeeded -- cancelling the save
 * dialog keeps the tab open, as UXP `onSaveScene` does.
 */

import { useCallback } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import { useShowConfirmCloseTabDialog } from '@renderer/dialogs/ConfirmCloseTabDialogProvider'
import { useCommands } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'

/** @returns `(viewId) => proceed` -- true lets the tab close. */
export function useConfirmCloseTab(cm: AsyncCueMol | null): (viewId: number) => Promise<boolean> {
  const showConfirmCloseTabDialog = useShowConfirmCloseTabDialog()
  const { dispatch } = useCommands()

  return useCallback(
    async (viewId: number): Promise<boolean> => {
      if (!cm) return true
      const info = await cm.invokeService('getSceneCloseInfo', { viewId })
      if (!info?.ok) return true
      if (!info.modified || info.viewCount !== 1) return true
      const result = await showConfirmCloseTabDialog({ sceneName: info.sceneName })
      if (result === 'cancel') return false
      if (result === 'discard') return true
      const saved = await dispatch(CmdId.FileSave)
      return saved === true
    },
    [cm, showConfirmCloseTabDialog, dispatch],
  )
}
