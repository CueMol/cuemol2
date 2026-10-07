/**
 * @file plugins/mcp/renderer/McpStatusItem.tsx
 * @description The MCP indicator in the status bar, and its popover.
 *
 * The icon says at a glance whether the server is off, waiting, running a
 * call, or failed to open its port. Clicking it opens the controls used
 * often enough not to belong in Settings: the on/off switch (the same value
 * as the Settings row), the dialog that shows how to connect each client, and
 * a new token -- laid out as a header and label / value rows, the
 * way an editor's status bar popover reads. Everything else is on the plugin's Settings page.
 */

import React, { useState } from 'react'
import { Button, Popover } from '@blueprintjs/core'
import {
  controlLocalApi,
  useLocalApiStatus,
  useOpenPluginSettings,
} from '@renderer/plugin-host/api'
import type { LocalApiStatus } from '@renderer/plugin-host/api'
import { AppIcon, useDarkPortalClass } from '@renderer/h3-kit/primitives'
import { SwitchField } from '@renderer/h3-kit/form'
import { MCP_PLUGIN_ID } from '../shared/mcpTypes'
import { McpConnectDialog } from './McpConnectDialog'
import { useMcpActivity } from './mcpActivity'
import type { McpActivity } from './mcpActivity'
import { useMcpPrefs } from './useMcpPrefs'

void React

type McpState = 'off' | 'starting' | 'idle' | 'running' | 'error'

function mcpState(enabled: boolean, status: LocalApiStatus | null, activity: McpActivity): McpState {
  if (!enabled) return 'off'
  if (status?.error) return 'error'
  if (!status?.listening || !status.endpoints.includes('mcp')) return 'starting'
  return activity.running > 0 ? 'running' : 'idle'
}

const STATE_LABELS: Record<McpState, string> = {
  off: 'Off',
  starting: 'Starting',
  idle: 'Ready',
  running: 'Running',
  error: 'Error',
}

/** The detail line under the status: where it listens, what runs, or what failed. */
function describeState(state: McpState, status: LocalApiStatus | null, activity: McpActivity): string {
  switch (state) {
    case 'off': return 'Not accepting connections.'
    case 'starting': return 'Opening the port...'
    case 'error': return status?.error ?? 'The server could not start.'
    case 'idle': return `Waiting for clients on 127.0.0.1:${status?.port}.`
    case 'running':
      return activity.running > 1
        ? `Running ${activity.tool} (+${activity.running - 1} more)`
        : `Running ${activity.tool}`
  }
}

export const McpStatusItem: React.FC = () => {
  const { serverEnabled, setServerEnabled } = useMcpPrefs()
  const status = useLocalApiStatus()
  const activity = useMcpActivity()
  const openSettings = useOpenPluginSettings(MCP_PLUGIN_ID)
  const portalClassName = useDarkPortalClass()
  const [open, setOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)

  const state = mcpState(serverEnabled, status, activity)
  const text = describeState(state, status, activity)

  const content = (
    <div className="mcp-pop">
      <div className="mcp-pop-header">
        <span className="type-title">MCP Server</span>
        <span className="mcp-pop-header-actions">
          <SwitchField checked={serverEnabled} onChange={setServerEnabled} />
          <Button
            minimal
            small
            icon={<AppIcon name="ui.settings" aria-hidden />}
            title="MCP Server settings"
            aria-label="MCP Server settings"
            onClick={() => {
              setOpen(false)
              openSettings()
            }}
          />
        </span>
      </div>

      <div className="mcp-pop-section">
        <div className="mcp-pop-row">
          <span className="type-label">Status</span>
          <span className={`type-body mcp-pop-value mcp-pop-value--${state}`}>{STATE_LABELS[state]}</span>
        </div>
        <span className={`type-caption mcp-pop-detail mcp-pop-value--${state}`}>{text}</span>
      </div>

      <div className="mcp-pop-section">
        <div className="mcp-pop-row">
          <span className="type-label">Clients</span>
          <button
            type="button"
            className="mcp-pop-link type-body"
            disabled={!status}
            onClick={() => {
              setOpen(false)
              setConnectOpen(true)
            }}
          >
            Set up...
          </button>
        </div>
        <span className="type-caption mcp-pop-detail">Claude Code, Codex, Antigravity and others.</span>
      </div>

      <div className="mcp-pop-section">
        <div className="mcp-pop-row">
          <span className="type-label">Token</span>
          <button
            type="button"
            className="mcp-pop-link type-body"
            disabled={!status}
            onClick={() => { void controlLocalApi({ action: 'regenerateToken' }) }}
          >
            Regenerate
          </button>
        </div>
        <span className="type-caption mcp-pop-detail">
          Clients registered with the old token must be registered again.
        </span>
      </div>
    </div>
  )

  return (
    <>
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
          className={`status-item mcp-status mcp-status--${state}`}
          title={`MCP Server: ${STATE_LABELS[state]}`}
          onClick={() => setOpen((v) => !v)}
        >
          <AppIcon name="status.mcp" size="sm" aria-hidden />
          <span>{state === 'running' ? `MCP: ${activity.tool}` : 'MCP'}</span>
        </button>
      )}
    />
    {status && (
      <McpConnectDialog
        visible={connectOpen}
        onClose={() => setConnectOpen(false)}
        port={status.port}
        token={status.token}
      />
    )}
    </>
  )
}
McpStatusItem.displayName = 'McpStatusItem'
