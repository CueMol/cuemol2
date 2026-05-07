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
import { NewTabDialog } from '../components/dialogs/NewTabDialog'
import type { NewTabDialogResult } from '../components/dialogs/NewTabDialog'
import { ConfirmCloseTabDialog } from '../components/dialogs/ConfirmCloseTabDialog'
import type { ConfirmCloseResult } from '../components/dialogs/ConfirmCloseTabDialog'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface NewTabDialogArgs {
  currentSceneName: string | null;
  defaultSceneName: string;
  defaultViewName: string;
}

interface DialogContextValue {
  /** Show the file-open option dialog and wait for user input. */
  showFileOpenOptionDialog(filePath: string, rendererTypes?: string[]): Promise<FileOpenOptions | null>
  /** Show the About dialog. */
  showAboutDialog(): Promise<void>
  /** Show the new-tab dialog and wait for user selection. */
  showNewTabDialog(args: NewTabDialogArgs): Promise<NewTabDialogResult | null>
  /** Show the close-tab confirmation dialog and wait for user selection. */
  showConfirmCloseTabDialog(args: { sceneName: string }): Promise<ConfirmCloseResult>
}

type DialogResolve = (options: FileOpenOptions | null) => void
type NewTabResolve = (result: NewTabDialogResult | null) => void
type ConfirmCloseResolve = (result: ConfirmCloseResult) => void

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

  const [newTabDlgState, setNewTabDlgState] = useState<NewTabDialogArgs & { visible: boolean }>({
    visible: false,
    currentSceneName: null,
    defaultSceneName: 'Scene_1',
    defaultViewName: 'View_1',
  })
  const newTabResolveRef = useRef<NewTabResolve | null>(null)

  const showNewTabDialog = useCallback((args: NewTabDialogArgs): Promise<NewTabDialogResult | null> => {
    return new Promise((resolve) => {
      newTabResolveRef.current = resolve
      setNewTabDlgState({ visible: true, ...args })
    })
  }, [])

  const handleNewTabConfirm = useCallback((result: NewTabDialogResult) => {
    setNewTabDlgState((s) => ({ ...s, visible: false }))
    newTabResolveRef.current?.(result)
    newTabResolveRef.current = null
  }, [])

  const handleNewTabCancel = useCallback(() => {
    setNewTabDlgState((s) => ({ ...s, visible: false }))
    newTabResolveRef.current?.(null)
    newTabResolveRef.current = null
  }, [])

  const [confirmCloseDlgState, setConfirmCloseDlgState] = useState<{ visible: boolean; sceneName: string }>({
    visible: false,
    sceneName: '',
  })
  const confirmCloseResolveRef = useRef<ConfirmCloseResolve | null>(null)

  const showConfirmCloseTabDialog = useCallback((args: { sceneName: string }): Promise<ConfirmCloseResult> => {
    return new Promise((resolve) => {
      confirmCloseResolveRef.current = resolve
      setConfirmCloseDlgState({ visible: true, sceneName: args.sceneName })
    })
  }, [])

  const handleConfirmCloseResult = useCallback((result: ConfirmCloseResult) => {
    setConfirmCloseDlgState((s) => ({ ...s, visible: false }))
    confirmCloseResolveRef.current?.(result)
    confirmCloseResolveRef.current = null
  }, [])

  const value = useMemo<DialogContextValue>(
    () => ({ showFileOpenOptionDialog, showAboutDialog, showNewTabDialog, showConfirmCloseTabDialog }),
    [showFileOpenOptionDialog, showAboutDialog, showNewTabDialog, showConfirmCloseTabDialog],
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
      <NewTabDialog
        visible={newTabDlgState.visible}
        currentSceneName={newTabDlgState.currentSceneName}
        defaultSceneName={newTabDlgState.defaultSceneName}
        defaultViewName={newTabDlgState.defaultViewName}
        onConfirm={handleNewTabConfirm}
        onCancel={handleNewTabCancel}
      />
      <ConfirmCloseTabDialog
        visible={confirmCloseDlgState.visible}
        sceneName={confirmCloseDlgState.sceneName}
        saveDisabled
        onResult={handleConfirmCloseResult}
      />
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
