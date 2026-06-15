/**
 * @file contexts/ViewInputConfigContext.tsx
 * @description React context for the pointing-device preference (mouse /
 * trackpad / auto) that selects the ViewInputConfig binding preset.
 *
 * Two layers:
 *   - PREFERENCE (persisted, 3-value): what the user picked in Settings.
 *   - EFFECTIVE (2-value): the device actually applied to the C++ preset.
 * When the preference is mouse/trackpad, effective equals it (manual). When
 * 'auto', a heuristic detector (input/inputDeviceDetector.ts) fed by the wheel
 * stream and pinch/rotate signals drives effective. Either way the applied
 * preset is re-applied live via cm.setViewInputConfigStyle -- no restart.
 *
 * The startup apply is done in createAndInitCueMol; this context tracks state
 * and re-applies on change. Persisted to electron-store via UI_SAVE / UI_LOAD.
 */

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react'
import { IPC } from '../../shared/ipcChannels'
import { useCueMol } from '../hooks/useCueMol'
import {
  type InputDeviceMode,
  type InputDevicePreference,
  DEFAULT_INPUT_DEVICE_MODE,
  DEFAULT_INPUT_DEVICE_PREFERENCE,
  normalizeInputDeviceMode,
  normalizeInputDevicePreference,
  viewInputStyleName,
} from '../viewInputConfig'
import { InputDeviceDetector } from '../input/inputDeviceDetector'
import type { WheelSample } from '../input/wheelDeviceClassifier'

interface ViewInputConfigContextValue {
  /** Persisted preference (mouse / trackpad / auto). */
  inputDevicePreference: InputDevicePreference
  /** Update the preference: persist it and re-apply / start detecting. */
  setInputDevicePreference: (p: InputDevicePreference) => void
  /** The device actually applied (mouse / trackpad) -- for the auto hint. */
  effectiveDeviceMode: InputDeviceMode
  /** Feed one wheel sample to the auto detector (no-op unless preference=auto). */
  feedWheelSample: (sample: WheelSample) => void
  /** Note a definitive trackpad gesture (pinch / rotate) for the auto detector. */
  noteTrackpadGesture: () => void
}

const ViewInputConfigContext = createContext<ViewInputConfigContextValue | null>(null)

export const ViewInputConfigProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { cm } = useCueMol()
  const [inputDevicePreference, setPreference] = useState<InputDevicePreference>(
    DEFAULT_INPUT_DEVICE_PREFERENCE,
  )
  const [effectiveDeviceMode, setEffective] = useState<InputDeviceMode>(
    DEFAULT_INPUT_DEVICE_MODE,
  )

  // Mutable refs so the wheel/gesture callbacks stay stable across renders.
  const preferenceRef = useRef(inputDevicePreference)
  preferenceRef.current = inputDevicePreference
  const detectorRef = useRef<InputDeviceDetector | null>(null)
  if (detectorRef.current === null) {
    const isMac = window.electronAPI?.platform === 'darwin'
    detectorRef.current = new InputDeviceDetector(DEFAULT_INPUT_DEVICE_MODE, isMac)
  }
  // Last device pushed to the C++ preset; createAndInitCueMol applied the seed.
  const lastAppliedRef = useRef<InputDeviceMode>(DEFAULT_INPUT_DEVICE_MODE)

  /** Apply an effective device to the C++ preset, but only when it changes. */
  const applyEffective = useCallback(
    (mode: InputDeviceMode) => {
      if (mode === lastAppliedRef.current) return
      lastAppliedRef.current = mode
      setEffective(mode)
      cm?.setViewInputConfigStyle(viewInputStyleName(mode)).catch(() => {})
    },
    [cm],
  )

  // Load persisted preference + detected seed on mount. Does NOT re-apply the
  // style (createAndInitCueMol already applied the same seed).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ui = await window.electronAPI?.invoke(IPC.UI_LOAD)
        if (cancelled || !ui) return
        const pref = normalizeInputDevicePreference(ui.inputDeviceMode)
        const seed =
          pref === 'auto' ? normalizeInputDeviceMode(ui.inputDeviceDetected) : pref
        setPreference(pref)
        setEffective(seed)
        lastAppliedRef.current = seed
        detectorRef.current!.reset(seed)
      } catch {
        // Electron not available (Vite dev server) -- keep the defaults.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const setInputDevicePreference = useCallback(
    (p: InputDevicePreference) => {
      setPreference(p)
      window.electronAPI?.invoke(IPC.UI_SAVE, { inputDeviceMode: p })
      if (p === 'mouse' || p === 'trackpad') {
        detectorRef.current!.reset(p)
        applyEffective(p)
      } else {
        // Enter auto: keep the current applied device; detect from here.
        detectorRef.current!.reset(lastAppliedRef.current)
      }
    },
    [applyEffective],
  )

  /** Route a detector result: re-apply + remember the detected device. */
  const handleDetected = useCallback(
    (next: InputDeviceMode) => {
      if (next === lastAppliedRef.current) return
      applyEffective(next)
      window.electronAPI?.invoke(IPC.UI_SAVE, { inputDeviceDetected: next })
    },
    [applyEffective],
  )

  const feedWheelSample = useCallback(
    (sample: WheelSample) => {
      if (preferenceRef.current !== 'auto') return
      handleDetected(detectorRef.current!.feedWheel(sample, performance.now()))
    },
    [handleDetected],
  )

  const noteTrackpadGesture = useCallback(() => {
    if (preferenceRef.current !== 'auto') return
    handleDetected(detectorRef.current!.noteTrackpadGesture(performance.now()))
  }, [handleDetected])

  const value = useMemo<ViewInputConfigContextValue>(
    () => ({
      inputDevicePreference,
      setInputDevicePreference,
      effectiveDeviceMode,
      feedWheelSample,
      noteTrackpadGesture,
    }),
    [
      inputDevicePreference,
      setInputDevicePreference,
      effectiveDeviceMode,
      feedWheelSample,
      noteTrackpadGesture,
    ],
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
