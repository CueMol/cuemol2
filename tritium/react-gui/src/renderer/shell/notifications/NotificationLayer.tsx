/**
 * @file shell/notifications/NotificationLayer.tsx
 * @description The toasts and the notification center, at the bottom right of the window.
 *
 * A fixed overlay just above the status bar, mounted beside it in AppShell:
 * the corner belongs to the bottom panel or the inspector depending on the
 * layout, so it cannot live inside a pane. Toasts stack with the newest at
 * the bottom; the center replaces them while it is open.
 */

import React from 'react'
import { ProgressBar } from '@blueprintjs/core'
import { AppIcon, useDarkPortalClass, type AppIconKey } from '@renderer/h3-kit/primitives'
import { FormButton } from '@renderer/h3-kit/form'
import { useNotifications, useNotify } from './NotificationProvider'
import { isClosable, type NotificationItem, type NotificationSeverity } from './notificationStore'

const SEVERITY_ICON: Record<NotificationSeverity, AppIconKey> = {
  info: 'ui.info',
  warning: 'ui.warning',
  error: 'ui.error',
}

/** One notification, as a toast or as a row of the center. */
const NotificationCard: React.FC<{ item: NotificationItem; inCenter: boolean }> = ({ item, inCenter }) => {
  const api = useNotify()
  const { progress, actions = [] } = item
  return (
    <div className={`notification notification--${item.severity}`} role="status">
      <div className="notification-head">
        <AppIcon name={SEVERITY_ICON[item.severity]} size="md" className="notification-icon" aria-hidden />
        <div className="notification-message type-body">{item.message}</div>
        <div className="notification-tools">
          {!inCenter && (
            <button type="button" className="notification-tool" title="Hide" aria-label="Hide notification"
              onClick={() => api.hide(item.id)}>
              <AppIcon name="ui.caretDown" size="sm" aria-hidden />
            </button>
          )}
          {isClosable(item) && (
            <button type="button" className="notification-tool" title="Close" aria-label="Close notification"
              onClick={() => api.close(item.id)}>
              <AppIcon name="ui.close" size="sm" aria-hidden />
            </button>
          )}
        </div>
      </div>
      {item.detail && <div className="notification-detail type-body">{item.detail}</div>}
      {progress && (
        <div className="notification-progress">
          <ProgressBar
            intent="primary"
            value={progress.fraction ?? undefined}
            animate={progress.fraction === null}
            stripes={progress.fraction === null}
          />
          {progress.label && <div className="notification-progress-label type-caption">{progress.label}</div>}
        </div>
      )}
      {(item.source || actions.length > 0) && (
        <div className="notification-foot">
          <span className="notification-source type-caption">{item.source ? `Source: ${item.source}` : ''}</span>
          <div className="notification-actions">
            {actions.map((a) => (
              <FormButton key={a.label} intent={a.primary ? 'primary' : undefined} onClick={a.run}>
                {a.label}
              </FormButton>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** See the file header. */
export const NotificationLayer: React.FC = () => {
  const { items, centerOpen } = useNotifications()
  const api = useNotify()
  // The layer is outside Blueprint's dark root (like a portal), so it takes
  // the theme class itself; without it the buttons draw in the light style.
  const layerClass = `notification-layer ${useDarkPortalClass()}`.trim()

  if (centerOpen) {
    return (
      <div className={layerClass}>
        <div className="notification-center" aria-label="Notifications">
          <div className="notification-center-header">
            <span className="notification-center-title type-eyebrow">
              {items.length ? 'Notifications' : 'No new notifications'}
            </span>
            <div className="notification-tools">
              <button type="button" className="notification-tool" title="Clear All Notifications"
                aria-label="Clear all notifications" onClick={() => api.clearAll()} disabled={!items.length}>
                <AppIcon name="ui.eraser" size="sm" aria-hidden />
              </button>
              <button type="button" className="notification-tool" title="Hide Notifications"
                aria-label="Hide notifications" onClick={() => api.setCenterOpen(false)}>
                <AppIcon name="ui.caretDown" size="sm" aria-hidden />
              </button>
            </div>
          </div>
          {items.length > 0 && (
            <div className="notification-center-list">
              {[...items].reverse().map((n) => <NotificationCard key={n.id} item={n} inCenter />)}
            </div>
          )}
        </div>
      </div>
    )
  }

  const toasts = items.filter((n) => n.toast)
  if (!toasts.length) return null
  return (
    <div className={layerClass}>
      <div className="notification-toasts">
        {toasts.map((n) => <NotificationCard key={n.id} item={n} inCenter={false} />)}
      </div>
    </div>
  )
}
