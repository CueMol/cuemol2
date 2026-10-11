/**
 * @file plugins/mcp/renderer/McpPortSettingRow.tsx
 * @description Settings > MCP Server > Port: the local API server's port.
 *
 * A port number is an identifier, not an amount, so it is a text field (no
 * slider, no stepper), and it is applied only on Enter or when the field
 * loses focus: applying each keystroke reopened the server on the digits
 * typed so far ("8" clamped to 1024, then "80", ...). A value outside
 * 1024-65535 is shown as an error and not applied.
 *
 * The line under the field says whether the server is actually listening
 * there, since the usual failure -- another program on that port -- is
 * otherwise invisible from Settings. The port is shared with the console's
 * command line, which reads it from the info file.
 */

import React, { useEffect, useState } from 'react'
import { ButtonRow, FormButton, TextField } from '@renderer/h3-kit/form'
import { useLocalApiStatus } from '@renderer/plugin-host/api'
import { DEFAULT_LOCAL_API_PORT } from '@shared/types/localApi'
import { useMcpPrefs } from './useMcpPrefs'

const MIN_PORT = 1024
const MAX_PORT = 65535

/** The port `text` names, or null when it is not a usable one. */
export function parsePort(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text.trim())
  return n >= MIN_PORT && n <= MAX_PORT ? n : null
}

/** See the file header. */
export const McpPortSettingRow: React.FC = () => {
  const { port, setPort } = useMcpPrefs()
  const status = useLocalApiStatus()
  const [text, setText] = useState(String(port))
  // Follow a change made elsewhere (Reset, another window of Settings).
  useEffect(() => setText(String(port)), [port])

  const parsed = parsePort(text)
  const commit = () => {
    if (parsed === null) return
    if (parsed !== port) setPort(parsed)
    setText(String(parsed))
  }

  let state: { cls: string; text: string } | null = null
  if (parsed === null) {
    state = { cls: 'error', text: `Enter a whole number from ${MIN_PORT} to ${MAX_PORT}.` }
  } else if (status && status.port === port && parsed === port) {
    if (status.listening) state = { cls: 'idle', text: `Listening on 127.0.0.1:${status.port}.` }
    else if (status.error) state = { cls: 'error', text: status.error }
    else state = { cls: 'off', text: 'The server is closed: no endpoint is switched on.' }
  }

  return (
    <div className="mcp-port-row">
      <div className="mcp-port-controls">
        <TextField
          value={text}
          onChange={setText}
          invalid={parsed === null}
          fill={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setText(String(port))
          }}
          onBlur={commit}
        />
        {port !== DEFAULT_LOCAL_API_PORT && (
          <ButtonRow>
            <FormButton onClick={() => setPort(DEFAULT_LOCAL_API_PORT)}>
              Reset to {DEFAULT_LOCAL_API_PORT}
            </FormButton>
          </ButtonRow>
        )}
      </div>
      {state && <div className={`type-caption mcp-port-state mcp-port-state--${state.cls}`}>{state.text}</div>}
    </div>
  )
}
