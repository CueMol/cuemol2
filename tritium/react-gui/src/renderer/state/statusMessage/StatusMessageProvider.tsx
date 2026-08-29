/**
 * @file state/statusMessage/StatusMessageProvider.tsx
 * @description The transient message in the status bar.
 *
 * Written by the viewport click handlers (pick feedback) and by the input
 * device detector; read by the status bar alone. Split into a value context
 * and a stable setter so the writers -- which sit under the WebGL canvas --
 * never re-render when the message changes.
 */

import React, { createContext, useContext, useState } from 'react'
import { useInputDeviceStatus } from '../../hooks/useInputDeviceStatus'

type Setter = React.Dispatch<React.SetStateAction<string | null>>

const ValueContext = createContext<string | null | undefined>(undefined)
const SetterContext = createContext<Setter | null>(null)

export function useStatusMessage(): string | null {
  const v = useContext(ValueContext)
  if (v === undefined) throw new Error('useStatusMessage must be used inside StatusMessageProvider')
  return v
}
export function useSetStatusMessage(): Setter {
  const v = useContext(SetterContext)
  if (v === null) throw new Error('useSetStatusMessage must be used inside StatusMessageProvider')
  return v
}

export function StatusMessageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [message, setMessage] = useState<string | null>(null)
  // Announce pointing-device switches (auto-detected or manual).
  useInputDeviceStatus(setMessage)
  return (
    <SetterContext.Provider value={setMessage}>
      <ValueContext.Provider value={message}>{children}</ValueContext.Provider>
    </SetterContext.Provider>
  )
}
