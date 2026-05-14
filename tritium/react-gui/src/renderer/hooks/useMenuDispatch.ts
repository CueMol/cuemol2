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
import type { RecentFileEntry } from '../../shared/ipcTypes'

export function useMenuDispatch(activeTab: string | null): {
  dispatchMenuChannel: (channel: string) => void
  dispatchOpenRecent: (entry: RecentFileEntry) => void
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
        case IPC.MENU_SAVE_SCENE_AS:
          dispatch(CmdId.FileSaveAs).catch(logErr('file.saveAs:'))
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
        case IPC.MENU_VIEW_PERSPECTIVE:
          dispatch(CmdId.ViewPerspective).catch(logErr('view.perspective:'))
          break
        case IPC.MENU_VIEW_ORTHOGRAPHIC:
          dispatch(CmdId.ViewOrthographic).catch(logErr('view.orthographic:'))
          break
        case IPC.MENU_CENTER_MARK_CROSS:
          dispatch(CmdId.ViewCenterMarkCross).catch(logErr('view.centerMark.cross:'))
          break
        case IPC.MENU_CENTER_MARK_AXIS:
          dispatch(CmdId.ViewCenterMarkAxis).catch(logErr('view.centerMark.axis:'))
          break
        case IPC.MENU_CENTER_MARK_NONE:
          dispatch(CmdId.ViewCenterMarkNone).catch(logErr('view.centerMark.none:'))
          break
        case IPC.MENU_BG_WHITE:
          dispatch(CmdId.SceneBgWhite).catch(logErr('scene.bg.white:'))
          break
        case IPC.MENU_BG_BLACK:
          dispatch(CmdId.SceneBgBlack).catch(logErr('scene.bg.black:'))
          break
        case IPC.MENU_ABOUT:
          dispatch(CmdId.UiAboutDialog).catch(logErr('about dialog:'))
          break
        case IPC.MENU_GET_PDB:
          dispatch(CmdId.UiGetPdbDialog).catch(logErr('get pdb dialog:'))
          break
        case 'menu:clear-recent':
          window.electronAPI
            ?.invoke(IPC.RECENT_CLEAR)
            .catch(logErr('recent.clear:'))
          break
        default:
          console.warn('menu action not yet implemented:', channel)
      }
    },
    [dispatch, activeTab],
  )

  const dispatchOpenRecent = useCallback(
    (entry: RecentFileEntry) => {
      const logErr = (prefix: string) => (e: unknown) => console.error(prefix, e)
      if (entry.ftype === 'scene') {
        dispatch(CmdId.OpenSceneByPath, entry.path).catch(logErr('recent.scene:'))
      } else {
        dispatch(CmdId.OpenObjByPath, { name: entry.path, path: entry.path })
          .catch(logErr('recent.obj:'))
      }
    },
    [dispatch],
  )

  return { dispatchMenuChannel, dispatchOpenRecent }
}
