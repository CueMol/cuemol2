/**
 * @file plugins/mcp/renderer/McpConnectDialog.tsx
 * @description How to connect an MCP client, one client at a time.
 *
 * Kept out of the status bar popover so that the popover stays a few lines
 * long whatever the clients' configuration formats look like. The token is
 * shown as a placeholder and filled in only in what is copied, so the dialog
 * can be on screen (or in a screenshot) without giving it away.
 */

import React, { useEffect, useState } from 'react'
import { Button } from '@blueprintjs/core'
import { DialogShell } from '@renderer/plugin-host/api'
import { SegmentField, TextAreaField } from '@renderer/h3-kit/form'
import { MCP_CLIENTS, TOKEN_PLACEHOLDER } from './clientSetup'
import type { McpClientId } from './clientSetup'

void React

/** The client last shown, so reopening the dialog lands on it. */
let lastClient: McpClientId = 'claude'

export interface McpConnectDialogProps {
  visible: boolean
  onClose: () => void
  port: number
  token: string
}

export const McpConnectDialog: React.FC<McpConnectDialogProps> = ({ visible, onClose, port, token }) => {
  const [clientId, setClientId] = useState<McpClientId>(lastClient)
  const [copied, setCopied] = useState(false)
  const client = MCP_CLIENTS.find((c) => c.id === clientId) ?? MCP_CLIENTS[0]
  const url = `http://127.0.0.1:${port}/mcp`

  useEffect(() => { lastClient = clientId }, [clientId])
  useEffect(() => { setCopied(false) }, [clientId, visible])
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const shown = client.snippet(url, TOKEN_PLACEHOLDER)
  const lines = shown.split('\n').length

  return (
    <DialogShell
      visible={visible}
      title="Connect a client"
      width="4xl"
      onCancel={onClose}
      footerActions={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            intent="primary"
            onClick={() => {
              void navigator.clipboard?.writeText(client.snippet(url, token))
              setCopied(true)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </>
      }
    >
      <div className="mcp-connect">
        <SegmentField
          value={clientId}
          onValueChange={setClientId}
          options={MCP_CLIENTS.map((c) => ({ value: c.id, label: c.label }))}
        />
        <span className="type-body">{client.where}</span>
        <TextAreaField value={shown} onChange={() => {}} readOnly mono minRows={lines} maxRows={lines} />
        <span className="type-caption mcp-connect-note">
          {client.note ? `${client.note} ` : ''}
          Copy fills in the token, shown here as {TOKEN_PLACEHOLDER}. After a new token or port,
          set the client up again.
        </span>
      </div>
    </DialogShell>
  )
}
McpConnectDialog.displayName = 'McpConnectDialog'
