/**
 * @file shell/notifications/NotificationProvider.tsx
 * @description Hosts the notification list and exposes `useNotify` / `useNotifications`.
 *
 * Mounted with the dialog providers (contexts/DialogContext.tsx): the same
 * "one host, a hook to reach it" shape. The toasts and the center are drawn
 * by NotificationLayer, the bell by NotificationBell.
 */

import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react'
import {
  INITIAL_NOTIFICATION_STATE,
  isClosable,
  notificationReducer,
  type NotificationInput,
  type NotificationState,
} from './notificationStore'

/** What `useNotify` returns. Stable across renders. */
export interface NotifyApi {
  /** Show a notification; returns its id. */
  notify(input: NotificationInput): number
  /**
   * Change a notification. `reToast` brings it back as a toast (for a change
   * the user should see, not for a progress tick).
   */
  update(id: number, input: Partial<NotificationInput>, reToast?: boolean): void
  /** Remove a notification without calling its `onClose`. */
  dismiss(id: number): void
  hide(id: number): void
  /** The user closed it: calls its `onClose` too. */
  close(id: number): void
  clearAll(): void
  setCenterOpen(open: boolean): void
}

const ApiContext = createContext<NotifyApi | null>(null)
const StateContext = createContext<NotificationState>(INITIAL_NOTIFICATION_STATE)

/** See the file header. */
export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(notificationReducer, INITIAL_NOTIFICATION_STATE)
  // The api reads the latest list (for onClose and the id of the next add)
  // without depending on it, so its identity never changes.
  const stateRef = useRef(state)
  stateRef.current = state
  const nextIdRef = useRef(INITIAL_NOTIFICATION_STATE.nextId)

  const notify = useCallback((input: NotificationInput) => {
    const id = nextIdRef.current++
    dispatch({ type: 'add', input })
    return id
  }, [])

  const api = useMemo<NotifyApi>(() => ({
    notify,
    update: (id, input, reToast) => dispatch({ type: 'update', id, input, reToast }),
    dismiss: (id) => {
      const n = stateRef.current.items.find((i) => i.id === id)
      if (n) dispatch({ type: 'update', id, input: { progress: undefined, persistent: false } })
      dispatch({ type: 'close', id })
    },
    hide: (id) => dispatch({ type: 'hide', id }),
    close: (id) => {
      stateRef.current.items.find((i) => i.id === id)?.onClose?.()
      dispatch({ type: 'close', id })
    },
    clearAll: () => {
      for (const n of stateRef.current.items) if (isClosable(n)) n.onClose?.()
      dispatch({ type: 'clearAll' })
    },
    setCenterOpen: (open) => dispatch({ type: 'setCenter', open }),
  }), [notify])

  return (
    <ApiContext.Provider value={api}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ApiContext.Provider>
  )
}

/** Raise and manage notifications. */
export function useNotify(): NotifyApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useNotify must be used inside NotificationProvider')
  return api
}

/** The current list (re-renders on every change; for the layer and the bell). */
export function useNotifications(): NotificationState {
  return useContext(StateContext)
}
