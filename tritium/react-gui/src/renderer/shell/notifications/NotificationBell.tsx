/**
 * @file shell/notifications/NotificationBell.tsx
 * @description The status bar bell: opens and closes the notification center.
 *
 * The rightmost status bar item, as in VS Code. A dot marks notifications not
 * yet seen; while one shows progress, its percentage sits beside the bell so
 * a hidden download is still visible.
 */

import React from 'react'
import { AppIcon } from '@renderer/h3-kit/primitives'
import { useNotifications, useNotify } from './NotificationProvider'

/** See the file header. */
export const NotificationBell: React.FC = () => {
  const { items, centerOpen } = useNotifications()
  const api = useNotify()
  const unread = items.some((n) => n.unread && !n.toast)
  const running = items.find((n) => n.progress && n.progress.fraction !== null)
  const pct = running ? Math.round((running.progress!.fraction ?? 0) * 100) : null
  const label = unread ? 'Notifications (new)' : 'Notifications'
  return (
    <button
      type="button"
      className={`status-item status-button status-bell${centerOpen ? ' status-bell--open' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={centerOpen}
      onClick={() => api.setCenterOpen(!centerOpen)}
    >
      {pct !== null && <span className="status-bell-progress">{pct}%</span>}
      <span className="status-bell-icon">
        <AppIcon name="status.bell" size="sm" aria-hidden />
        {unread && <span className="status-bell-dot" aria-hidden />}
      </span>
    </button>
  )
}
