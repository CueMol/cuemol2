/**
 * @file contexts/ModalOpenCounterContext.tsx
 * @description Tracks how many modal dialogs (Blueprint Dialog / message box)
 * are currently open. When the count crosses 0 -> 1 it tells the main process
 * to disable the application menu (so accelerators like Cmd+Q stop firing
 * while a modal is up); the 1 -> 0 transition re-enables it. Mirrors the UXP
 * behaviour where XUL modal dialogs implicitly suppress parent-window menu
 * accelerators.
 *
 * The block deliberately spares the text-edit items (see `TEXT_EDIT_MENU_IDS`
 * in `main/menuBlock.ts`): on macOS the menu owns the Cmd+X/C/V/A/Z key
 * equivalents, so disabling them would leave a dialog's text fields with no
 * way to paste at all. The same edges therefore also tell the renderer-side
 * clipboard router that a modal is up, so those keystrokes stay confined to
 * the focused field instead of reaching a panel behind the dialog.
 */

import React, { createContext, useCallback, useContext, useRef } from 'react'
import { IPC } from '../../shared/ipcChannels'
import { setClipboardModalOpen } from '../utils/editClipboard'

interface ModalOpenCounter {
  inc: () => void
  dec: () => void
}

const ModalOpenCounterContext = createContext<ModalOpenCounter | null>(null)
ModalOpenCounterContext.displayName = 'ModalOpenCounterContext'

export const ModalOpenCounterProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const countRef = useRef(0)

  const notify = useCallback((blocked: boolean) => {
    setClipboardModalOpen(blocked)
    const api = window.electronAPI
    if (!api) return
    api.invoke(IPC.MENU_SET_MODAL_BLOCKED, blocked).catch((err: unknown) => {
      console.warn('MENU_SET_MODAL_BLOCKED failed:', err)
    })
  }, [])

  const inc = useCallback(() => {
    const next = countRef.current + 1
    countRef.current = next
    if (next === 1) notify(true)
  }, [notify])

  const dec = useCallback(() => {
    const next = countRef.current - 1
    countRef.current = next < 0 ? 0 : next
    if (countRef.current === 0) notify(false)
  }, [notify])

  const value = useRef<ModalOpenCounter>({ inc, dec })
  // Keep callbacks fresh without recreating the context value (which would
  // retrigger consumers' useEffect that depends on the counter identity).
  value.current.inc = inc
  value.current.dec = dec

  return (
    <ModalOpenCounterContext.Provider value={value.current}>
      {children}
    </ModalOpenCounterContext.Provider>
  )
}

/** Returns the counter handle if a Provider is mounted, or null otherwise. */
export function useModalOpenCounterIfAny(): ModalOpenCounter | null {
  return useContext(ModalOpenCounterContext)
}

/** Test-only: lets tests inject a custom counter (typically with vi.fn spies). */
export const ModalOpenCounterTestProvider: React.FC<{
  value: ModalOpenCounter
  children: React.ReactNode
}> = ({ value, children }) => (
  <ModalOpenCounterContext.Provider value={value}>
    {children}
  </ModalOpenCounterContext.Provider>
)
