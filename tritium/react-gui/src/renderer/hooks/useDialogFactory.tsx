/**
 * @file hooks/useDialogFactory.tsx
 * @description Generic factory that turns a render-prop dialog component into
 * an imperative `show(args) => Promise<result>` hook. Each dialog gets its own
 * `Provider` and `useShow` pair so adding a new dialog is one file.
 *
 * Usage:
 *   const { Provider: AboutDialogProvider, useShow: useShowAboutDialog } =
 *     createDialogHook<void, void>({
 *       name: 'AboutDialog',
 *       render: ({ visible, resolve }) => (
 *         <AboutDialog visible={visible} onClose={() => resolve()} />
 *       ),
 *     })
 *
 *   // In a command handler:
 *   const showAbout = useShowAboutDialog()
 *   await showAbout()
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useModalOpenCounterIfAny } from '../contexts/ModalOpenCounterContext'

interface DialogState<TArgs> {
  visible: boolean
  args: TArgs | undefined
}

export interface DialogRenderProps<TArgs, TResult> {
  visible: boolean
  args: TArgs | undefined
  resolve: (result: TResult) => void
}

export interface CreateDialogHookOptions<TArgs, TResult> {
  /** Renders the dialog component for the current `visible`/`args` state. */
  render: (props: DialogRenderProps<TArgs, TResult>) => React.ReactNode
  /** Optional human label used in error messages. */
  name?: string
}

export interface DialogHookHandle<TArgs, TResult> {
  Provider: React.FC<{ children: React.ReactNode }>
  useShow: () => (args: TArgs) => Promise<TResult>
}

export function createDialogHook<TArgs, TResult>(
  options: CreateDialogHookOptions<TArgs, TResult>,
): DialogHookHandle<TArgs, TResult> {
  const Context = createContext<((args: TArgs) => Promise<TResult>) | null>(null)
  const displayName = options.name ?? 'Dialog'
  Context.displayName = `${displayName}Context`

  const Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<DialogState<TArgs>>({ visible: false, args: undefined })
    const resolveRef = useRef<((result: TResult) => void) | null>(null)
    const counter = useModalOpenCounterIfAny()

    // While this dialog is visible, contribute one tick to the global modal
    // counter. The 0 -> 1 / 1 -> 0 boundary disables / re-enables the app menu.
    useEffect(() => {
      if (!counter || !state.visible) return
      counter.inc()
      return () => counter.dec()
    }, [state.visible, counter])

    const show = useCallback((args: TArgs): Promise<TResult> => {
      return new Promise<TResult>((resolve) => {
        resolveRef.current = resolve
        setState({ visible: true, args })
      })
    }, [])

    const handleResolve = useCallback((result: TResult) => {
      setState((prev) => ({ ...prev, visible: false }))
      const r = resolveRef.current
      resolveRef.current = null
      r?.(result)
    }, [])

    return (
      <Context.Provider value={show}>
        {children}
        {options.render({ visible: state.visible, args: state.args, resolve: handleResolve })}
      </Context.Provider>
    )
  }
  Provider.displayName = `${displayName}Provider`

  function useShow(): (args: TArgs) => Promise<TResult> {
    const ctx = useContext(Context)
    if (!ctx) {
      throw new Error(`use${displayName}: must be used inside <${displayName}Provider>.`)
    }
    return ctx
  }

  return { Provider, useShow }
}
