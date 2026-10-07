/**
 * @file plugins/mcp/renderer/useMcpPrefs.ts
 * @description The MCP settings rows, read back typed.
 */

import { usePluginPrefs } from '@renderer/plugin-host/api'
import { DEFAULT_LOCAL_API_PORT } from '@shared/types/localApi'
import { MCP_PLUGIN_ID, MCP_PREF_KEYS } from '../shared/mcpTypes'

export interface McpPrefs {
  serverEnabled: boolean
  port: number
  setServerEnabled: (on: boolean) => void
}

export function useMcpPrefs(): McpPrefs {
  const { prefs, setPref } = usePluginPrefs(MCP_PLUGIN_ID)
  const port = prefs[MCP_PREF_KEYS.port]
  return {
    serverEnabled: prefs[MCP_PREF_KEYS.serverEnabled] !== false,
    port: typeof port === 'number' ? port : DEFAULT_LOCAL_API_PORT,
    setServerEnabled: (on) => setPref(MCP_PREF_KEYS.serverEnabled, on),
  }
}
