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
import { selectAllInScope } from '../utils/selectAllScope'

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
        case 'menu:change-chain-id':
          dispatch(CmdId.UiChangeChainIdDialog).catch(logErr('change chain id dialog:'))
          break
        case 'menu:delete-mol-atoms':
          dispatch(CmdId.UiDeleteMolDialog).catch(logErr('delete mol dialog:'))
          break
        case 'menu:change-resid-num':
          dispatch(CmdId.UiChangeResidueIndexDialog).catch(logErr('change residue index dialog:'))
          break
        case 'menu:merge-mol':
          dispatch(CmdId.UiMergeMolDialog).catch(logErr('merge mol dialog:'))
          break
        case 'menu:reassign-2ndry':
          dispatch(CmdId.UiReassignProt2ndryDialog).catch(logErr('reassign 2ndry dialog:'))
          break
        case 'menu:mol-superpose':
          dispatch(CmdId.UiMolSuperpose).catch(logErr('mol superpose dialog:'))
          break
        case 'menu:mol-surf':
          dispatch(CmdId.UiMakeMolSurfDialog).catch(logErr('make mol surf dialog:'))
          break
        case 'menu:clear-recent':
          window.electronAPI
            ?.invoke(IPC.RECENT_CLEAR)
            .catch(logErr('recent.clear:'))
          break
        case 'menu:save-file-as':
          dispatch(CmdId.ObjectSaveAs).catch(logErr('object.saveAs:'))
          break
        case 'menu:save-current-view':
          dispatch(CmdId.SaveCurrentView).catch(logErr('file.saveCurrentView:'))
          break
        case 'menu:export-scene':
          dispatch(CmdId.ExportImage).catch(logErr('file.exportImage:'))
          break
        case 'menu:reload-scene':
          dispatch(CmdId.SceneReload).catch(logErr('scene.reload:'))
          break
        case 'menu:view-props':
          dispatch(CmdId.UiViewProperty).catch(logErr('ui.viewProperty:'))
          break
        case 'menu:select-all':
          // Scoped Select All: focused field or active selectable region only,
          // never the whole document. See utils/selectAllScope.ts.
          selectAllInScope()
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
      } else if (entry.readerName) {
        // Reader recorded at first open: reuse it directly (UXP MRU parity).
        // contentFirst is irrelevant once readerName pins the reader.
        dispatch(CmdId.OpenObjByPath, {
          name: entry.path, path: entry.path,
          contentFirst: false, readerName: entry.readerName,
        }).catch(logErr('recent.obj:'))
      } else {
        // Legacy entry without a stored reader: no filter context, so
        // default to content-first sniff (qdf* readers are excluded by
        // pickReaderName) to resolve a renamed / extension-spoofed file.
        dispatch(CmdId.OpenObjByPath, { name: entry.path, path: entry.path, contentFirst: true })
          .catch(logErr('recent.obj:'))
      }
    },
    [dispatch],
  )

  return { dispatchMenuChannel, dispatchOpenRecent }
}
