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

/** Push channels whose only effect is to forward themselves to dispatchMenuChannel. */
const MENU_PASS_THROUGH = [
  IPC.MENU_NEW_TAB,
  IPC.MENU_CLOSE_TAB,
  IPC.MENU_SAVE,
  IPC.MENU_NEW_SCENE,
  IPC.MENU_OPEN_FILE,
  IPC.MENU_OPEN_SCENE,
  IPC.MENU_UNDO,
  IPC.MENU_REDO,
] as const

export function useElectronIpc(activeTab: string | null): void {
  const { dispatch } = useCommands()
  const { dispatchMenuChannel } = useMenuDispatch(activeTab)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const logErr = (prefix: string) => (e: unknown) => console.error(prefix, e)

    const unsubs = [
      api.onPush(IPC.OBJ_FILE_OPENED, (d) =>
        dispatch(CmdId.OpenObjByPath, d).catch(logErr('obj open:')),
      ),
      api.onPush(IPC.SCENE_FILE_OPENED, (d) =>
        dispatch(CmdId.OpenSceneByPath, d.path).catch(logErr('scene open:')),
      ),
      api.onPush(IPC.FILE_ERROR, (d) =>
        console.error(`Failed to open ${d.path}: ${d.error}`),
      ),
      api.onPush(IPC.MENU_GENERIC, (ch) => dispatchMenuChannel(ch)),
      ...MENU_PASS_THROUGH.map((ch) => api.onPush(ch, () => dispatchMenuChannel(ch))),
    ]

    return () => unsubs.forEach((u) => u())
  }, [dispatch, dispatchMenuChannel])
}
