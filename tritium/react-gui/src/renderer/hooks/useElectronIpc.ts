/**
 * @file hooks/useElectronIpc.ts
 * @description Wires Electron IPC events to the command registry.
 *
 * This hook is a thin adapter: it subscribes to window.electronAPI events
 * and dispatches the corresponding command IDs. All business logic lives in
 * the command handlers registered by useSceneCommands.
 *
 * IPC events handled:
 *   file:obj-opened   - dispatch SceneOpenObjPath
 *   file:scene-opened - dispatch SceneOpenScenePath
 *   file:error        - log error
 *   menu:*            - delegated to useMenuDispatch
 */

import { useEffect } from 'react'
import { useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'
import { IPC } from '../../shared/ipcChannels'
import { useMenuDispatch } from './useMenuDispatch'

export function useElectronIpc(activeTab: string | null): void {
  const { dispatch } = useCommands()
  const { dispatchMenuChannel } = useMenuDispatch(activeTab)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const logErr = (prefix: string) => (e: unknown) => console.error(prefix, e)

    const unsubs = [
      api.onObjFileOpened((d) =>
        dispatch(CmdId.OpenObjByPath, d).catch(logErr('obj open:')),
      ),
      api.onSceneFileOpened((d) =>
        dispatch(CmdId.OpenSceneByPath, d.path).catch(logErr('scene open:')),
      ),
      api.onFileError((d) =>
        console.error(`Failed to open ${d.path}: ${d.error}`),
      ),
      api.onMenuNewTab(() => dispatchMenuChannel(IPC.MENU_NEW_TAB)),
      api.onMenuCloseTab(() => dispatchMenuChannel(IPC.MENU_CLOSE_TAB)),
      api.onMenuSave(() => dispatchMenuChannel(IPC.MENU_SAVE)),
      api.onMenuNewScene(() => dispatchMenuChannel(IPC.MENU_NEW_SCENE)),
      api.onMenuOpenFile(() => dispatchMenuChannel(IPC.MENU_OPEN_FILE)),
      api.onMenuOpenScene(() => dispatchMenuChannel(IPC.MENU_OPEN_SCENE)),
      api.onMenuUndo(() => dispatchMenuChannel(IPC.MENU_UNDO)),
      api.onMenuRedo(() => dispatchMenuChannel(IPC.MENU_REDO)),
    ]

    return () => unsubs.forEach((u) => u())
  }, [dispatch, dispatchMenuChannel])
}
