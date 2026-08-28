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
  /**
   * Value handed to a caller whose dialog is superseded, i.e. `show()` is
   * called again while that one is still open.
   *
   * Only one dialog of a given kind can be on screen, so the earlier caller
   * never gets an answer from the user. Its promise is settled with this
   * instead of being abandoned -- an abandoned `await` parks the caller
   * forever, which is how a queued shell-open drain used to lose its files.
   *
   * Defaults to `undefined`. Set it for a dialog whose result type has no
   * natural empty value, so "superseded" cannot be mistaken for a real answer
   * (e.g. `'cancel'`, not a fallthrough into "save").
   */
  supersededResult?: TResult
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
        // Settle the caller we are about to displace before taking the slot.
        const superseded = resolveRef.current
        resolveRef.current = resolve
        superseded?.(options.supersededResult as TResult)
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

/**
 * Minimal props a confirm/cancel dialog component must accept for
 * {@link createConfirmCancelDialog}: `visible`, plus an `onConfirm(result)` and
 * `onCancel()` pair. The remaining props come from the dialog's `TArgs`.
 */
export type ConfirmCancelDialogProps<TArgs, TResult> = TArgs & {
  visible: boolean
  onConfirm: (result: TResult) => void
  onCancel: () => void
}

export interface CreateConfirmCancelDialogOptions<TArgs, TResult> {
  /**
   * The dialog component. It receives `visible`, the spread `TArgs`, and the
   * mapped `onConfirm` / `onCancel` handlers.
   */
  component: React.ComponentType<ConfirmCancelDialogProps<TArgs, TResult>>
  /** Human label used in the provider display name + error message. */
  name: string
}

/**
 * Convenience wrapper over {@link createDialogHook} for the common
 * confirm/cancel dialog shape: the show-args are spread onto the dialog
 * component as props, `onConfirm(result)` resolves the Promise with the result,
 * and `onCancel()` resolves it with `null`.
 *
 * Removes the boilerplate render-prop that every such provider repeated, while
 * keeping the one-file-per-dialog convention (each provider file still calls
 * this and re-exports its own `Provider` / `useShow`).
 *
 * @typeParam TArgs - the show-args object, spread as props onto the component.
 * @typeParam TResult - the dialog's confirm result; the hook resolves
 *   `TResult | null` (`null` on cancel).
 */
export function createConfirmCancelDialog<TArgs, TResult>(
  options: CreateConfirmCancelDialogOptions<TArgs, TResult>,
): DialogHookHandle<TArgs, TResult | null> {
  const { component: Component, name } = options
  return createDialogHook<TArgs, TResult | null>({
    name,
    // A confirm/cancel dialog already resolves null on cancel, so that is the
    // right answer for a caller whose dialog was displaced.
    supersededResult: null,
    render: ({ visible, args, resolve }) =>
      React.createElement(Component, {
        ...((args ?? {}) as TArgs),
        visible,
        onConfirm: (result: TResult) => resolve(result),
        onCancel: () => resolve(null),
      }),
  })
}
