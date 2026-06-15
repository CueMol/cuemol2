/**
 * @file hooks/useInputDeviceStatus.ts
 * @description Shows a transient status-bar message whenever the applied
 * pointing device changes -- so an auto-detected mouse <-> trackpad switch (or
 * a manual change) is visible. Driven by ViewInputConfigContext's
 * `deviceSwitch` signal, which excludes the startup seed so launch is silent.
 */

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { useViewInputConfig } from '../contexts/ViewInputConfigContext'
import { INPUT_DEVICE_LABELS } from '../viewInputConfig'

/** Milliseconds the switch message stays before auto-clearing. */
const STATUS_MS = 2500

/**
 * Announce pointing-device switches in the status bar.
 *
 * @param setStatusMessage - the App status-message setter (StatusBar source)
 */
export function useInputDeviceStatus(
  setStatusMessage: Dispatch<SetStateAction<string | null>>,
): void {
  const { deviceSwitch, inputDevicePreference } = useViewInputConfig()
  const seqRef = useRef(deviceSwitch.seq)

  useEffect(() => {
    if (deviceSwitch.seq === seqRef.current) return
    seqRef.current = deviceSwitch.seq
    const label = INPUT_DEVICE_LABELS[deviceSwitch.mode]
    const msg =
      inputDevicePreference === 'auto'
        ? `Input device auto-detected: ${label}`
        : `Input device: ${label}`
    setStatusMessage(msg)
    // Clear after a moment, but only if it is still our message (do not clobber
    // a newer tool-hover / render message).
    const t = setTimeout(() => setStatusMessage((cur) => (cur === msg ? null : cur)), STATUS_MS)
    return () => clearTimeout(t)
  }, [deviceSwitch, inputDevicePreference, setStatusMessage])
}
