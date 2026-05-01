/**
 * @file hooks/useMenuDispatch.ts
 * @description Maps IPC menu channel names to command dispatch calls.
 *
 * Used by both useElectronIpc (native menu IPC events) and MenuBar
 * (React custom menu clicks) so both code paths share the same logic.
 */

import { useCallback } from 'react'
import { useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'
import { IPC } from '../../shared/ipcChannels'

export function useMenuDispatch(activeTab: string | null): {
  dispatchMenuChannel: (channel: string) => void
} {
  const { dispatch } = useCommands()

  const dispatchMenuChannel = useCallback(
    (channel: string) => {
      const logErr = (prefix: string) => (e: unknown) => console.error(prefix, e)
      switch (channel) {
        case IPC.MENU_OPEN_FILE:
          dispatch(CmdId.UiOpenObjDialog).catch(logErr('open obj dialog:'))
          break
        case IPC.MENU_SAVE:
          dispatch(CmdId.FileSave).catch(logErr('file.save:'))
          break
        case IPC.MENU_NEW_TAB:
          dispatch(CmdId.TabNew).catch(logErr('tab.new:'))
          break
        case IPC.MENU_CLOSE_TAB:
          if (activeTab) dispatch(CmdId.TabClose, activeTab).catch(logErr('tab.close:'))
          break
        case IPC.MENU_UNDO:
          dispatch(CmdId.Undo).catch(logErr('undo:'))
          break
        case IPC.MENU_REDO:
          dispatch(CmdId.Redo).catch(logErr('redo:'))
          break
        case IPC.MENU_NEW_SCENE:
          dispatch(CmdId.SceneNew).catch(logErr('scene.new:'))
          break
        case IPC.MENU_OPEN_SCENE:
          dispatch(CmdId.UiOpenSceneDialog).catch(logErr('open scene dialog:'))
          break
      }
    },
    [dispatch, activeTab],
  )

  return { dispatchMenuChannel }
}
