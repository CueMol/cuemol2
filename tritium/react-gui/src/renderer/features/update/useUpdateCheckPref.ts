/**
 * @file features/update/useUpdateCheckPref.ts
 * @description The "check for updates at startup" preference (`UiState.updateCheck`).
 *
 * Main reads it from the store when the window comes up, so the Settings
 * row only loads and saves it; nothing else in the renderer depends on it.
 */

import { useCallback, useEffect, useState } from 'react'
import { IPC } from '@shared/ipcChannels'

/** The preference and its setter; true until the stored value has loaded. */
export function useUpdateCheckPref(): { updateCheck: boolean; setUpdateCheck: (on: boolean) => void } {
  const [updateCheck, setState] = useState(true)
  useEffect(() => {
    let alive = true
    void window.electronAPI?.invoke(IPC.UI_LOAD).then((ui) => {
      if (alive) setState(ui.updateCheck !== false)
    })
    return () => { alive = false }
  }, [])
  const setUpdateCheck = useCallback((on: boolean) => {
    setState(on)
    void window.electronAPI?.invoke(IPC.UI_SAVE, { updateCheck: on })
  }, [])
  return { updateCheck, setUpdateCheck }
}
