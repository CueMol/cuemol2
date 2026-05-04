/**
 * @file contexts/DialogContext.tsx
 * @description React context that provides imperative dialog APIs.
 *
 * Encapsulates the state management and rendering of modal dialogs so that
 * command handlers can show dialogs via simple async calls without leaking
 * UI state into the root component.
 *
 * New dialogs can be added by extending DialogContextValue with a new method,
 * adding internal state, and rendering the dialog component inside the provider.
 */

import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react'
import { FileOpenOptionDialog } from '../components/fopen-opt-dlgs'
import type { FileOpenOptions } from '../components/fopen-opt-dlgs'
import { AboutDialog } from '../components/dialogs/AboutDialog'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface DialogContextValue {
  /** Show the file-open option dialog and wait for user input. */
  showFileOpenOptionDialog(filePath: string, rendererTypes?: string[]): Promise<FileOpenOptions | null>
  /** Show the About dialog. */
  showAboutDialog(): Promise<void>
}

type DialogResolve = (options: FileOpenOptions | null) => void

// ────────────────────────────────────────────────────────────
// Context
// ────────────────────────────────────────────────────────────

const DialogContext = createContext<DialogContextValue | null>(null)

// ────────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────────

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [optionDlgState, setOptionDlgState] = useState<{ visible: boolean; filePath: string }>({
    visible: false,
    filePath: '',
  })
  const resolveRef = useRef<DialogResolve | null>(null)
  const rendererTypesRef = useRef<string[]>([])

  const showFileOpenOptionDialog = useCallback((filePath: string, rendererTypes: string[] = []): Promise<FileOpenOptions | null> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      rendererTypesRef.current = rendererTypes
      setOptionDlgState({ visible: true, filePath })
    })
  }, [])

  const handleConfirm = useCallback((options: FileOpenOptions) => {
    setOptionDlgState((s) => ({ ...s, visible: false }))
    resolveRef.current?.(options)
    resolveRef.current = null
  }, [])

  const handleCancel = useCallback(() => {
    setOptionDlgState((s) => ({ ...s, visible: false }))
    resolveRef.current?.(null)
    resolveRef.current = null
  }, [])

  const [aboutDlgVisible, setAboutDlgVisible] = useState(false)
  const aboutResolveRef = useRef<(() => void) | null>(null)

  const showAboutDialog = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      aboutResolveRef.current = resolve
      setAboutDlgVisible(true)
    })
  }, [])

  const handleAboutClose = useCallback(() => {
    setAboutDlgVisible(false)
    aboutResolveRef.current?.()
    aboutResolveRef.current = null
  }, [])

  const value = useMemo<DialogContextValue>(
    () => ({ showFileOpenOptionDialog, showAboutDialog }),
    [showFileOpenOptionDialog, showAboutDialog],
  )

  return (
    <DialogContext.Provider value={value}>
      {children}
      <FileOpenOptionDialog
        visible={optionDlgState.visible}
        filePath={optionDlgState.filePath}
        rendererTypes={rendererTypesRef.current}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      <AboutDialog visible={aboutDlgVisible} onClose={handleAboutClose} />
    </DialogContext.Provider>
  )
}

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

/**
 * Access the dialog service.
 * Must be called inside a `<DialogProvider>`.
 */
export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) {
    throw new Error('useDialog() must be used within a <DialogProvider>.')
  }
  return ctx
}
