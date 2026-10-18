/**
 * @file plugins/console/renderer/CliStatusItem.tsx
 * @description The command line (tritium_cli) indicator in the status bar,
 * and its popover.
 *
 * The same shape as the MCP item: the label is coloured by whether
 * tritium_cli can connect (off, starting, ready, running a submission,
 * failed), and the popover holds the on/off switch (the Command line access
 * setting), the state, and the command to copy. Everything else is on the
 * Console's Settings page.
 */

import React, { useEffect, useState } from 'react'
import { Button, Popover } from '@blueprintjs/core'
import {
  useCliAccessGranted,
  useLocalApiStatus,
  useOpenPluginSettings,
  usePluginPrefs,
} from '@renderer/plugin-host/api'
import type { LocalApiStatus } from '@renderer/plugin-host/api'
import { AppIcon, useDarkPortalClass } from '@renderer/h3-kit/primitives'
import { SwitchField } from '@renderer/h3-kit/form'
import { IPC } from '@shared/ipcChannels'
import { CONSOLE_PLUGIN_ID, REMOTE_ACCESS_PREF } from '../shared/consoleTypes'
import { useCliRunning } from './cliActivity'

void React

type CliState = 'off' | 'starting' | 'idle' | 'running' | 'error'

function cliState(open: boolean, status: LocalApiStatus | null, running: number): CliState {
  if (!open) return 'off'
  if (status?.error) return 'error'
  if (!status?.listening || !status.endpoints.includes('console')) return 'starting'
  return running > 0 ? 'running' : 'idle'
}

const STATE_LABELS: Record<CliState, string> = {
  off: 'Off',
  starting: 'Starting',
  idle: 'Ready',
  running: 'Running',
  error: 'Error',
}

function describeState(state: CliState, status: LocalApiStatus | null, running: number): string {
  switch (state) {
    case 'off': return 'tritium_cli cannot connect.'
    case 'starting': return 'Opening the port...'
    case 'error': return status?.error ?? 'The port could not be opened.'
    case 'idle': return `Waiting for tritium_cli on 127.0.0.1:${status?.port}.`
    case 'running': return running > 1 ? `Running ${running} submissions from tritium_cli.` : 'Running a submission from tritium_cli.'
  }
}

export const CliStatusItem: React.FC = () => {
  const { prefs, setPref } = usePluginPrefs(CONSOLE_PLUGIN_ID)
  const accessOn = prefs[REMOTE_ACCESS_PREF] === true
  const launched = useCliAccessGranted()
  const status = useLocalApiStatus()
  const running = useCliRunning()
  const openSettings = useOpenPluginSettings(CONSOLE_PLUGIN_ID)
  const portalClassName = useDarkPortalClass()
  const [open, setOpen] = useState(false)
  const [cliPath, setCliPath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    void window.electronAPI?.invoke(IPC.APP_PATH).then((info) => {
      if (live && info) setCliPath(info.cliPath)
    })
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const state = cliState(accessOn || launched, status, running)
  const forThisRun = launched && !accessOn && state !== 'off'

  const content = (
    <div className="status-pop">
      <div className="status-pop-header">
        <span className="type-title">Command Line</span>
        <span className="status-pop-header-actions">
          <SwitchField checked={accessOn} onChange={(on) => setPref(REMOTE_ACCESS_PREF, on)} />
          <Button
            minimal
            small
            icon={<AppIcon name="ui.settings" aria-hidden />}
            title="Console settings"
            aria-label="Console settings"
            onClick={() => {
              setOpen(false)
              openSettings()
            }}
          />
        </span>
      </div>

      <div className="status-pop-section">
        <div className="status-pop-row">
          <span className="type-label">Status</span>
          <span className={`type-body status-pop-value status-pop-value--${state}`}>{STATE_LABELS[state]}</span>
        </div>
        <span className={`type-caption status-pop-detail status-pop-value--${state}`}>
          {describeState(state, status, running)}
        </span>
        {forThisRun && (
          <span className="type-caption status-pop-detail">
            Open until CueMol3 quits: it was started from tritium_cli.
          </span>
        )}
      </div>

      <div className="status-pop-section">
        <div className="status-pop-row">
          <span className="type-label">Command</span>
          <button
            type="button"
            className="status-pop-link type-body"
            disabled={!cliPath}
            onClick={() => {
              if (!cliPath) return
              void navigator.clipboard?.writeText(cliPath)
              setCopied(true)
            }}
          >
            {copied ? 'Copied' : 'Copy path'}
          </button>
        </div>
        <span className="type-caption status-pop-detail">
          {cliPath === '' ? 'Not available in the AppImage.' : (cliPath ?? '')}
        </span>
      </div>
    </div>
  )

  return (
    <Popover
      isOpen={open}
      onClose={() => setOpen(false)}
      placement="top-end"
      portalClassName={portalClassName}
      content={content}
      renderTarget={({ isOpen: _o, ref, ...targetProps }) => (
        <button
          {...targetProps}
          ref={ref}
          type="button"
          className={`status-item status-button status-button--${state}`}
          title={`Command line: ${STATE_LABELS[state]}`}
          onClick={() => setOpen((v) => !v)}
        >
          <AppIcon name="status.cli" size="sm" aria-hidden />
          <span>CLI</span>
        </button>
      )}
    />
  )
}
CliStatusItem.displayName = 'CliStatusItem'
