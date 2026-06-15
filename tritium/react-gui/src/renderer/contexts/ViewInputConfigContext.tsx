/**
 * @file contexts/ViewInputConfigContext.tsx
 * @description React context for the persisted "pointing device" preference
 * (mouse vs Mac trackpad) that selects the ViewInputConfig binding preset.
 *
 * The preset is applied to the C++ view-input singleton at startup
 * (createAndInitCueMol). This context tracks the current mode for the UI and
 * re-applies the matching style live when the user changes it in the
 * SettingsPane -- no restart needed. Persisted to electron-store via the
 * UI_SAVE / UI_LOAD IPC channels, the same mechanism as the render binary
 * paths (RenderConfigContext).
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react'
import { IPC } from '../../shared/ipcChannels'
import { useCueMol } from '../hooks/useCueMol'
import {
  type InputDeviceMode,
  DEFAULT_INPUT_DEVICE_MODE,
  normalizeInputDeviceMode,
  viewInputStyleName,
} from '../viewInputConfig'

interface ViewInputConfigContextValue {
  /** Current pointing-device mode. */
  inputDeviceMode: InputDeviceMode
  /** Update the mode: persist it and re-apply the matching style live. */
  setInputDeviceMode: (mode: InputDeviceMode) => void
}

const ViewInputConfigContext = createContext<ViewInputConfigContextValue | null>(null)

export const ViewInputConfigProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { cm } = useCueMol()
  const [inputDeviceMode, setMode] = useState<InputDeviceMode>(DEFAULT_INPUT_DEVICE_MODE)

  // Load the persisted mode on mount (display only; the startup apply is done
  // in createAndInitCueMol, so we do not re-apply the style here).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ui = await window.electronAPI?.invoke(IPC.UI_LOAD)
        if (cancelled || !ui) return
        setMode(normalizeInputDeviceMode(ui.inputDeviceMode))
      } catch {
        // Electron not available (Vite dev server) -- keep the default.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const setInputDeviceMode = useCallback(
    (mode: InputDeviceMode) => {
      setMode(mode)
      window.electronAPI?.invoke(IPC.UI_SAVE, { inputDeviceMode: mode })
      // Re-apply live so the change takes effect without a restart.
      cm?.setViewInputConfigStyle(viewInputStyleName(mode)).catch(() => {})
    },
    [cm],
  )

  const value = useMemo<ViewInputConfigContextValue>(
    () => ({ inputDeviceMode, setInputDeviceMode }),
    [inputDeviceMode, setInputDeviceMode],
  )

  return (
    <ViewInputConfigContext.Provider value={value}>
      {children}
    </ViewInputConfigContext.Provider>
  )
}

/** Access the pointing-device preference. Must be inside `<ViewInputConfigProvider>`. */
export function useViewInputConfig(): ViewInputConfigContextValue {
  const ctx = useContext(ViewInputConfigContext)
  if (!ctx) {
    throw new Error('useViewInputConfig() must be used within a <ViewInputConfigProvider>.')
  }
  return ctx
}
