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
import { MENU_PASS_THROUGH_CHANNELS } from '../../shared/menuActionMap'
import type { PushChannel } from '../../shared/ipcContract'
import { useMenuDispatch } from './useMenuDispatch'
import { useShowErrorAlert } from '../components/dialogs/ErrorAlertDialogProvider'

/**
 * Push channels whose only effect is to forward themselves to
 * dispatchMenuChannel. Derived from menuActionMap (the 'dedicated-direct'
 * delivery set) so it can never drift from the main-process send choice.
 *
 * Each dedicated-direct channel is a void-payload push channel; the cast
 * narrows the menu-action key union to the PushChannel union it is a subset of.
 */
const MENU_PASS_THROUGH = MENU_PASS_THROUGH_CHANNELS as readonly PushChannel[]

export function useElectronIpc(activeTab: string | null): void {
  const { dispatch } = useCommands()
  const { dispatchMenuChannel, dispatchOpenRecent } = useMenuDispatch(activeTab)
  const showErrorAlert = useShowErrorAlert()

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
      api.onPush(IPC.FILE_ERROR, (d) => {
        console.error(`Failed to open ${d.path}: ${d.error}`)
        showErrorAlert({
          title: 'Open File failed',
          message: `Failed to open:\n${d.path}\n\n${d.error}`,
        }).catch(logErr('FILE_ERROR alert:'))
      }),
      api.onPush(IPC.MENU_OPEN_RECENT, (entry) => dispatchOpenRecent(entry)),
      api.onPush(IPC.MENU_GENERIC, (ch) => dispatchMenuChannel(ch)),
      ...MENU_PASS_THROUGH.map((ch) => api.onPush(ch, () => dispatchMenuChannel(ch))),
    ]

    return () => unsubs.forEach((u) => u())
  }, [dispatch, dispatchMenuChannel, dispatchOpenRecent, showErrorAlert])
}
