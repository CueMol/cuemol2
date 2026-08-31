/**
 * @file contexts/AppSettingsContext.tsx
 * @description React context for app-level user-defined defaults edited in the
 * SettingsPane: atom-label defaults (`DefaultLabel.*`) and view-input scalars
 * (`tbrad` / `hitprec`).
 *
 * Unlike RenderConfigContext (electron-store), these are user-defined STYLE
 * values. They are applied live to C++ via worker services and persisted the
 * UXP way -- written into the "user" style set and saved to the user style
 * file on window close (see App.tsx `saveUserStyleOnClose` /
 * workerLifecycle.saveUserStyle). So this context does NOT touch electron-store.
 *
 * Initial values are read back from C++ on mount, which already reflects the
 * user style file loaded at startup (`createAndInitCueMol.loadUserStyle`).
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'
import type {
  LabelDefaults,
  SetLabelDefaultsArgs,
} from '@renderer/worker/server/services/view/labelDefaults'
import type {
  ViewInputParams,
  SetViewInputParamsArgs,
} from '@renderer/worker/server/services/view/viewInputParams'

interface AppSettingsContextValue {
  labelDefaults: LabelDefaults
  setLabelDefault: (key: keyof LabelDefaults, value: string | number | boolean) => void
  viewInputParams: ViewInputParams
  setViewInputParam: (key: keyof ViewInputParams, value: number) => void
}

const DEFAULT_LABELS: LabelDefaults = {
  fontName: 'sans-serif',
  fontSize: 12,
  color: '#ffff00',
  bold: false,
  italic: false,
}

const DEFAULT_VIEW_INPUT: ViewInputParams = { tbrad: 0.8, hitprec: 10.0 }

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null)

export const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { cm } = useCueMol()
  const [labelDefaults, setLabelDefaults] = useState<LabelDefaults>(DEFAULT_LABELS)
  const [viewInputParams, setViewInputParams] =
    useState<ViewInputParams>(DEFAULT_VIEW_INPUT)

  // Read the live C++ values on mount (reflects the user style file loaded at
  // startup). Falls back to defaults when the core is not ready yet.
  const guard = useStaleGuard()
  useEffect(() => {
    if (!cm) return
    const token = guard.next()
    ;(async () => {
      try {
        const [labels, view] = await Promise.all([
          cm.invokeService('getLabelDefaults', {}),
          cm.invokeService('getViewInputParams', {}),
        ])
        if (!guard.isCurrent(token)) return
        if (labels?.ok) setLabelDefaults(labels.defaults)
        if (view?.ok) setViewInputParams(view.params)
      } catch {
        // core unavailable -- keep defaults
      }
    })()
    return () => guard.invalidate()
  }, [cm, guard])

  const setLabelDefault = useCallback(
    (key: keyof LabelDefaults, value: string | number | boolean) => {
      setLabelDefaults((prev) => ({ ...prev, [key]: value }))
      // Live C++ apply; persistence happens on window close (save-style).
      cm?.invokeService('setLabelDefaults', { [key]: value } as SetLabelDefaultsArgs)
    },
    [cm],
  )

  const setViewInputParam = useCallback(
    (key: keyof ViewInputParams, value: number) => {
      setViewInputParams((prev) => ({ ...prev, [key]: value }))
      cm?.invokeService('setViewInputParams', { [key]: value } as SetViewInputParamsArgs)
    },
    [cm],
  )

  const value = useMemo<AppSettingsContextValue>(
    () => ({ labelDefaults, setLabelDefault, viewInputParams, setViewInputParam }),
    [labelDefaults, setLabelDefault, viewInputParams, setViewInputParam],
  )

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  )
}

/** Access app-level label/view-input defaults. Must be inside `<AppSettingsProvider>`. */
export function useAppSettings(): AppSettingsContextValue {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) {
    throw new Error('useAppSettings() must be used within an <AppSettingsProvider>.')
  }
  return ctx
}
