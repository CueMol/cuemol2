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
 *   menu:new-tab      - dispatch TabNew
 *   menu:close-tab    - dispatch TabClose (with current activeTab)
 *   menu:save         - dispatch FileSave
 *   menu:new-scene    - dispatch SceneNew
 *   menu:open-file    - dispatch UiOpenObjDialog
 *   menu:open-scene   - dispatch UiOpenSceneDialog
 */

import { useEffect } from 'react'
import { useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'

export function useElectronIpc(activeTab: string | null): void {
  const { dispatch } = useCommands()

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
      api.onMenuNewTab(() =>
        dispatch(CmdId.TabNew).catch(logErr('tab.new:')),
      ),
      api.onMenuCloseTab(() => {
        if (activeTab) dispatch(CmdId.TabClose, activeTab).catch(logErr('tab.close:'))
      }),
      api.onMenuSave(() =>
        dispatch(CmdId.FileSave).catch(logErr('file.save:')),
      ),
      api.onMenuNewScene(() =>
        dispatch(CmdId.SceneNew).catch(logErr('scene.new:')),
      ),
      api.onMenuOpenFile(() =>
        dispatch(CmdId.UiOpenObjDialog).catch(logErr('open obj dialog:')),
      ),
      api.onMenuOpenScene(() =>
        dispatch(CmdId.UiOpenSceneDialog).catch(logErr('open scene dialog:')),
      ),
    ]

    return () => unsubs.forEach((u) => u())
  }, [dispatch, activeTab])
}
