/**
 * @file state/activeView/ActiveViewStateProvider.tsx
 * @description The active view's menu-mirrored attributes (projection,
 * center mark, background colour, colour proofing) and the scene-exporter
 * capability probe.
 *
 * Owns `useActiveViewState` and `useSceneExportCaps` so that MenuBar, the
 * View pane and the command layer read the same cache instead of App
 * threading it to each of them. Values and writers are separate contexts:
 * a writer-only subscriber (a command hook) never re-renders on a fetch.
 */

import React, { createContext, useContext, useMemo } from 'react'
import type { SceneBgColor, ViewCenterMark } from '@shared/types/menuState'
import { useCueMol } from '../../hooks/cuemol/useCueMol'
import { useActiveViewState } from '../../hooks/useActiveViewState'
import { useSceneExportCaps } from '../../hooks/useSceneExportCaps'
import { useActiveScene } from '../workspace'

export interface ActiveViewValues {
  viewProjection: boolean | null
  viewCenterMark: ViewCenterMark | null
  sceneBgColor: SceneBgColor | null
  /** Whether colour proofing is on for the scene; null when there is none. */
  sceneColorProof: boolean | null
  /** Scene-exporter nicknames this build offers; null until probed. */
  exportAvailable: string[] | null
}

export interface ActiveViewDispatch {
  onProjectionChanged: (perspective: boolean) => void
  onCenterMarkChanged: (centerMark: ViewCenterMark) => void
  onBgColorChanged: (bgColor: SceneBgColor) => void
  onColorProofingChanged: (active: boolean) => void
}

const ValuesContext = createContext<ActiveViewValues | null>(null)
const DispatchContext = createContext<ActiveViewDispatch | null>(null)

export function useActiveViewValues(): ActiveViewValues {
  const v = useContext(ValuesContext)
  if (v === null) throw new Error('useActiveViewValues must be used inside ActiveViewStateProvider')
  return v
}
export function useActiveViewDispatch(): ActiveViewDispatch {
  const v = useContext(DispatchContext)
  if (v === null) throw new Error('useActiveViewDispatch must be used inside ActiveViewStateProvider')
  return v
}

export function ActiveViewStateProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { cm, cueMolReady } = useCueMol()
  const { activeMolViewId, activeSceneId } = useActiveScene()
  const {
    viewProjection, viewCenterMark, sceneBgColor, sceneColorProof,
    onProjectionChanged, onCenterMarkChanged, onBgColorChanged, onColorProofingChanged,
  } = useActiveViewState({ cm, activeMolViewId, activeSceneId })
  const exportAvailable = useSceneExportCaps({ cm, cueMolReady })

  const values = useMemo<ActiveViewValues>(
    () => ({ viewProjection, viewCenterMark, sceneBgColor, sceneColorProof, exportAvailable }),
    [viewProjection, viewCenterMark, sceneBgColor, sceneColorProof, exportAvailable],
  )
  const dispatch = useMemo<ActiveViewDispatch>(
    () => ({ onProjectionChanged, onCenterMarkChanged, onBgColorChanged, onColorProofingChanged }),
    [onProjectionChanged, onCenterMarkChanged, onBgColorChanged, onColorProofingChanged],
  )

  return (
    <DispatchContext.Provider value={dispatch}>
      <ValuesContext.Provider value={values}>{children}</ValuesContext.Provider>
    </DispatchContext.Provider>
  )
}
