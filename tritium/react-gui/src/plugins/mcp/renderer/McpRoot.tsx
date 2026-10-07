/**
 * @file plugins/mcp/renderer/McpRoot.tsx
 * @description The plugin's mount point: it owns the `mcp` endpoint.
 *
 * Renders nothing. Mounted while the plugin is enabled; the endpoint is
 * open while the "MCP server" setting is on as well. Each request is answered
 * by the worker; this only adds what the worker cannot know -- which tab is
 * active -- and records the running calls for the status bar.
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  controlLocalApi,
  useCueMol,
  useEnsureActiveScene,
  useLocalApiEndpoint,
  useSuppressUndoRedo,
} from '@renderer/plugin-host/api'
import { mcpServices } from '../calls'
import type { McpCallResult } from '../shared/mcpTypes'
import { beginMcpCall } from './mcpActivity'
import { useMcpPrefs } from './useMcpPrefs'

void React

function failed(message: string): McpCallResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

export const McpRoot: React.FC = () => {
  const { cm } = useCueMol()
  const ensureActiveScene = useEnsureActiveScene()
  const { serverEnabled, port } = useMcpPrefs()
  const [running, setRunning] = useState(0)
  // A call holds an undo transaction open in the worker; undoing into it
  // would land the scene somewhere nobody has seen.
  useSuppressUndoRedo(running > 0)
  const callIds = useRef(new Map<number, string>())

  // The port row commits per keystroke; wait for the typing to stop so the
  // server is not reopened on every digit. Declared ahead of the endpoint, so
  // on mount the port is set before the endpoint opens.
  const firstPort = useRef(true)
  useEffect(() => {
    if (firstPort.current) {
      firstPort.current = false
      void controlLocalApi({ action: 'setPort', port })
      return
    }
    const t = setTimeout(() => { void controlLocalApi({ action: 'setPort', port }) }, 800)
    return () => clearTimeout(t)
  }, [port])

  useLocalApiEndpoint('mcp', cm !== null && serverEnabled, {
    async handle({ reqId, kind, payload }) {
      if (!cm) throw new Error('CueMol is not ready yet.')
      switch (kind) {
        case 'describe': {
          const res = await mcpServices.invoke(cm, 'describe', {})
          if (!res.ok) throw new Error(res.error)
          return { instructions: res.instructions }
        }
        case 'listTools': {
          const res = await mcpServices.invoke(cm, 'listTools', {})
          if (!res.ok) throw new Error(res.error)
          return { tools: res.tools }
        }
        case 'callTool': {
          const p = payload as { name: string; arguments: Record<string, unknown> }
          const callId = `mcp-${reqId}`
          callIds.current.set(reqId, callId)
          setRunning((n) => n + 1)
          const end = beginMcpCall(p.name)
          try {
            const target = await ensureActiveScene()
            const res = await mcpServices.invoke(
              cm,
              'callTool',
              {
                callId,
                name: p.name,
                arguments: p.arguments,
                sceneId: target?.scene_uid ?? 0,
                viewId: target?.view_id ?? 0,
              },
              // A render can take minutes; the busy indicator is not the place.
              { quiet: true },
            )
            if (!res.ok) return failed(res.error)
            return { content: res.content, isError: res.isError }
          } finally {
            callIds.current.delete(reqId)
            setRunning((n) => n - 1)
            end()
          }
        }
        default:
          throw new Error(`Unknown request: ${kind}`)
      }
    },
    cancel(reqId) {
      const callId = callIds.current.get(reqId)
      if (cm && callId) void mcpServices.invoke(cm, 'cancelCall', { callId })
    },
  })

  return null
}
McpRoot.displayName = 'McpRoot'
