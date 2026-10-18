/**
 * @file shell/notifications/notificationStore.ts
 * @description The notification list and its operations, as a pure reducer.
 *
 * Modelled on VS Code's notifications: a new notification appears as a toast
 * at the bottom right; hiding it (or opening the center) takes it off screen
 * but keeps it in the center, reached from the status bar bell; closing it
 * removes it. A notification with progress, or one marked persistent (it
 * stands for something still pending), cannot be closed, only hidden: the
 * center is where the user finds it again.
 */

/** How a notification is coloured and which icon it shows. */
export type NotificationSeverity = 'info' | 'warning' | 'error'

/** A button on a notification. */
export interface NotificationAction {
  label: string
  /** Drawn as the primary (filled) button. */
  primary?: boolean
  run: () => void
}

/** What a caller passes to `notify` / `update`. */
export interface NotificationInput {
  severity: NotificationSeverity
  message: string
  /** Secondary line under the message. */
  detail?: string
  /** Who raised it, shown small at the bottom left (VS Code's "Source"). */
  source?: string
  actions?: NotificationAction[]
  /** A progress bar: a fraction in 0..1, or null for an indeterminate one. */
  progress?: { fraction: number | null; label?: string }
  /**
   * Stands for something still pending (an update on offer): it can be
   * hidden but not closed, so it stays in the center until its owner
   * removes it.
   */
  persistent?: boolean
  /** Called when the user closes it (not when it is hidden). */
  onClose?: () => void
}

/** A notification in the list. */
export interface NotificationItem extends NotificationInput {
  id: number
  /** Shown as a toast (rather than only in the center). */
  toast: boolean
  /** Not yet seen in the center; drives the bell's dot. */
  unread: boolean
}

/** The whole state. */
export interface NotificationState {
  items: NotificationItem[]
  centerOpen: boolean
  nextId: number
}

export const INITIAL_NOTIFICATION_STATE: NotificationState = { items: [], centerOpen: false, nextId: 1 }

/** The reducer's actions. */
export type NotificationOp =
  | { type: 'add'; input: NotificationInput }
  | { type: 'update'; id: number; input: Partial<NotificationInput>; reToast?: boolean }
  | { type: 'hide'; id: number }
  | { type: 'close'; id: number }
  | { type: 'clearAll' }
  | { type: 'setCenter'; open: boolean }

/** Whether the user may close `n` (as opposed to only hiding it). */
export function isClosable(n: NotificationInput): boolean {
  return n.progress === undefined && !n.persistent
}

/** See the file header. */
export function notificationReducer(state: NotificationState, action: NotificationOp): NotificationState {
  switch (action.type) {
    case 'add': {
      const item: NotificationItem = {
        ...action.input,
        id: state.nextId,
        // While the center is open the new one is listed there instead.
        toast: !state.centerOpen,
        unread: !state.centerOpen,
      }
      return { ...state, items: [...state.items, item], nextId: state.nextId + 1 }
    }
    case 'update':
      return {
        ...state,
        items: state.items.map((n) => {
          if (n.id !== action.id) return n
          const next = { ...n, ...action.input }
          if (action.reToast && !state.centerOpen) {
            next.toast = true
            next.unread = true
          }
          return next
        }),
      }
    case 'hide':
      return { ...state, items: state.items.map((n) => (n.id === action.id ? { ...n, toast: false } : n)) }
    case 'close':
      return { ...state, items: state.items.filter((n) => n.id !== action.id || !isClosable(n)) }
    case 'clearAll':
      return { ...state, items: state.items.filter((n) => !isClosable(n)) }
    case 'setCenter':
      // Opening the center shows everything there: no toasts, nothing unread.
      return {
        ...state,
        centerOpen: action.open,
        items: action.open ? state.items.map((n) => ({ ...n, toast: false, unread: false })) : state.items,
      }
  }
}
