/**
 * @file features/settings/settings/SecretSettingControl.tsx
 * @description The control behind a `secret` settings row.
 *
 * Unlike every other kind, the value is not held by the pane: it lives in the
 * OS keychain behind the secret IPC channels, and only its status is ever
 * read back. So this row owns its own draft state and talks to main directly,
 * the way the `path` row already talks to the file dialog.
 *
 * What the user sees is the status line, never the value: which source is in
 * force, and the last four characters so they can tell one key from another.
 * A typed value is committed on Enter or on blur; an empty draft commits
 * nothing, so leaving the field untouched cannot clear a stored key (Clear
 * does that, deliberately and explicitly).
 */

import React, { useCallback, useEffect, useState } from 'react'
import { FormButton, TextField } from '@renderer/h3-kit/form'
import { IPC } from '@shared/ipcChannels'
import type { SecretStatusRes } from '@shared/types/secrets'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'

export interface SecretSettingControlProps {
  /** Owning namespace (the plugin id), filled in by the plugin host. */
  namespace: string
  /** Key within the namespace. */
  secretKey: string
  /** Environment variable consulted when nothing is stored. */
  envVar?: string
  /** The row's label, used in the placeholder. */
  label: string
}

const UNKNOWN: SecretStatusRes = { source: 'none', last4: null, encryptionAvailable: true }

/** One line saying where the value comes from, without revealing it. */
function statusText(status: SecretStatusRes, envVar?: string): string {
  if (status.source === 'stored') return `Stored (....${status.last4 ?? ''})`
  if (status.source === 'env') return `Using ${envVar ?? 'the environment'} (....${status.last4 ?? ''})`
  if (!status.encryptionAvailable) {
    return envVar
      ? `Not set. This system cannot store credentials; set ${envVar} instead.`
      : 'Not set. This system cannot store credentials.'
  }
  return 'Not set'
}

export const SecretSettingControl: React.FC<SecretSettingControlProps> = ({
  namespace,
  secretKey,
  envVar,
  label,
}) => {
  const [status, setStatus] = useState<SecretStatusRes>(UNKNOWN)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const guard = useStaleGuard()

  const refresh = useCallback(() => {
    const token = guard.next()
    void (async () => {
      try {
        const res = await window.electronAPI?.invoke(IPC.SECRET_STATUS, {
          namespace, key: secretKey, envVar,
        })
        if (res && guard.isCurrent(token)) setStatus(res)
      } catch {
        // Electron not available (Vite dev server) -- leave the default.
      }
    })()
  }, [guard, namespace, secretKey, envVar])

  useEffect(() => {
    refresh()
    return () => guard.invalidate()
  }, [refresh, guard])

  const commit = useCallback(() => {
    // An empty draft is "I did not type anything", not "clear it".
    if (draft === '') return
    const value = draft
    setDraft('')
    void (async () => {
      try {
        const res = await window.electronAPI?.invoke(IPC.SECRET_SET, {
          namespace, key: secretKey, envVar, value,
        })
        setError(res && !res.ok ? (res.error ?? 'Could not store the value.') : null)
      } catch {
        setError('Could not store the value.')
      }
      refresh()
    })()
  }, [draft, namespace, secretKey, envVar, refresh])

  const clear = useCallback(() => {
    setDraft('')
    void (async () => {
      try {
        await window.electronAPI?.invoke(IPC.SECRET_SET, {
          namespace, key: secretKey, envVar, value: '',
        })
        setError(null)
      } catch {
        setError('Could not clear the value.')
      }
      refresh()
    })()
  }, [namespace, secretKey, envVar, refresh])

  return (
    <div className="config-setting-secret">
      <div className="config-setting-path-row">
        <TextField
          value={draft}
          onChange={setDraft}
          password
          placeholder={status.source === 'none' ? `Enter ${label}` : 'Enter a new value to replace it'}
          onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
          onBlur={commit}
        />
        <FormButton
          text="Clear"
          onClick={clear}
          disabled={status.source !== 'stored'}
        />
      </div>
      <div className="config-setting-secret-status">{statusText(status, envVar)}</div>
      {error && <div className="config-setting-secret-error">{error}</div>}
    </div>
  )
}
SecretSettingControl.displayName = 'SecretSettingControl'
