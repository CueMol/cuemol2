/**
 * @file state/statusMessage/StatusMessageProvider.tsx
 * @description The two transient lines of the status bar.
 *
 * `message` is written by the viewport click handlers (pick feedback) and by
 * the input device detector; `hoverMessage` by the viewport hover handler
 * (what is under the pointer) and takes precedence while non-null, so a
 * click message survives underneath a hover and is visible again once the
 * pointer leaves the molecule. Both are read by the status bar alone. Each
 * is split into a value context and a stable setter so the writers -- which
 * sit under the WebGL canvas -- never re-render when a message changes.
 */

import React, { createContext, useContext, useState } from 'react'
import { useInputDeviceStatus } from '@renderer/hooks/useInputDeviceStatus'

type Setter = React.Dispatch<React.SetStateAction<string | null>>

const ValueContext = createContext<string | null | undefined>(undefined)
const SetterContext = createContext<Setter | null>(null)
const HoverValueContext = createContext<string | null | undefined>(undefined)
const HoverSetterContext = createContext<Setter | null>(null)

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

/** The pointer-hover line (hit under the cursor); null when nothing is hovered. */
export function useHoverMessage(): string | null {
  const v = useContext(HoverValueContext)
  if (v === undefined) throw new Error('useHoverMessage must be used inside StatusMessageProvider')
  return v
}
/** Stable setter for the hover line; writers under the canvas never re-render. */
export function useSetHoverMessage(): Setter {
  const v = useContext(HoverSetterContext)
  if (v === null) throw new Error('useSetHoverMessage must be used inside StatusMessageProvider')
  return v
}

export function StatusMessageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [message, setMessage] = useState<string | null>(null)
  const [hoverMessage, setHoverMessage] = useState<string | null>(null)
  // Announce pointing-device switches (auto-detected or manual).
  useInputDeviceStatus(setMessage)
  return (
    <SetterContext.Provider value={setMessage}>
      <HoverSetterContext.Provider value={setHoverMessage}>
        <ValueContext.Provider value={message}>
          <HoverValueContext.Provider value={hoverMessage}>{children}</HoverValueContext.Provider>
        </ValueContext.Provider>
      </HoverSetterContext.Provider>
    </SetterContext.Provider>
  )
}
