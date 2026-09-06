/**
 * @file contexts/PickingPrefsContext.tsx
 * @description React context for the 3D view picking preferences edited in
 * Settings: whether the GPU ID-buffer pick pass is used (else the CPU point
 * hit test) and whether the hover label is shown.
 *
 * Both are host preferences ("this machine is slow"), not scene properties,
 * so they persist in electron-store (UI_LOAD / UI_SAVE) like the pointing
 * device, not in the scene file. `gpuPicking` is also pushed to the C++
 * singleton (ViewInputConfig.gpu_pick) on load and on change; the switch takes
 * effect on the next hit test, no restart. `hoverInfo` is renderer-only: it
 * gates the hover controller (useHoverInfoHandler). `hoverHighlight` is
 * passed with every hover request, so the worker needs no copy of it.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { IPC } from '@shared/ipcChannels'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'

export interface PickingPrefs {
  gpuPicking: boolean
  hoverInfo: boolean
  /** Highlight the element under the pointer in the 3D view (GPU pick overlay). */
  hoverHighlight: boolean
}

export const DEFAULT_PICKING_PREFS: PickingPrefs = {
  gpuPicking: true,
  hoverInfo: true,
  hoverHighlight: true,
}

interface PickingPrefsContextValue extends PickingPrefs {
  setPickingPref: (key: keyof PickingPrefs, value: boolean) => void
}

const PickingPrefsContext = createContext<PickingPrefsContextValue | null>(null)

export const PickingPrefsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { cm } = useCueMol()
  const [prefs, setPrefs] = useState<PickingPrefs>(DEFAULT_PICKING_PREFS)

  // Load the persisted preferences on mount and push the GPU switch to C++
  // (its default is on, so only an off value changes anything).
  const guard = useStaleGuard()
  useEffect(() => {
    const token = guard.next()
    ;(async () => {
      try {
        const ui = await window.electronAPI?.invoke(IPC.UI_LOAD)
        if (!guard.isCurrent(token) || !ui) return
        const next: PickingPrefs = {
          gpuPicking: ui.gpuPicking ?? true,
          hoverInfo: ui.hoverInfo ?? true,
          hoverHighlight: ui.hoverHighlight ?? true,
        }
        setPrefs(next)
        if (!next.gpuPicking) {
          cm?.invokeService('setGpuPickEnabled', { enabled: false }).catch(() => {})
        }
      } catch {
        // Electron not available (Vite dev server) -- keep the defaults.
      }
    })()
    return () => guard.invalidate()
  }, [cm, guard])

  const setPickingPref = useCallback(
    (key: keyof PickingPrefs, value: boolean) => {
      setPrefs((prev) => ({ ...prev, [key]: value }))
      window.electronAPI?.invoke(IPC.UI_SAVE, { [key]: value })
      if (key === 'gpuPicking') {
        cm?.invokeService('setGpuPickEnabled', { enabled: value }).catch(() => {})
      }
    },
    [cm],
  )

  const value = useMemo<PickingPrefsContextValue>(
    () => ({ ...prefs, setPickingPref }),
    [prefs, setPickingPref],
  )

  return <PickingPrefsContext.Provider value={value}>{children}</PickingPrefsContext.Provider>
}

/**
 * Access the picking preferences. Outside a provider (tests, isolated
 * mounts) the defaults are returned and the setter is a no-op.
 */
export function usePickingPrefs(): PickingPrefsContextValue {
  const ctx = useContext(PickingPrefsContext)
  return ctx ?? { ...DEFAULT_PICKING_PREFS, setPickingPref: () => undefined }
}
