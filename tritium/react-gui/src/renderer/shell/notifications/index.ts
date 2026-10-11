/**
 * @file shell/notifications/index.ts
 * @description VS Code style notifications: toasts, the center and the status bar bell.
 */

export { NotificationProvider, useNotify, useNotifications } from './NotificationProvider'
export type { NotifyApi } from './NotificationProvider'
export { NotificationLayer } from './NotificationLayer'
export { NotificationBell } from './NotificationBell'
export type { NotificationInput, NotificationSeverity, NotificationAction } from './notificationStore'
