/**
 * @file plugins/mcp/manifest.ts
 * @description What the MCP plugin contributes.
 *
 * Separate from `index.ts` so the id can be imported without pulling the
 * plugin's React tree in with it.
 */

import type { PluginManifest } from '@renderer/plugin-host/api'
import { DEFAULT_LOCAL_API_PORT } from '@shared/types/localApi'
import { MCP_PLUGIN_ID, MCP_PREF_KEYS } from './shared/mcpTypes'

export const mcpManifest: PluginManifest = {
  id: MCP_PLUGIN_ID,
  name: 'MCP Server',
  version: '1.0.0',
  description:
    'Experimental. Lets an AI client on this computer (Claude Code, Claude Desktop, ...) ' +
    'drive CueMol through the Model Context Protocol.',
  // Off by default: it opens a port, which nobody should get without asking.
  defaultEnabled: false,
  contributes: {
    statusBar: [{ id: 'mcp' }],
    settings: [
      {
        key: MCP_PREF_KEYS.serverEnabled,
        label: 'Accept connections',
        description:
          'Serve MCP clients on this computer. Turning this off closes the port but keeps the ' +
          'status bar item, from which it can be turned back on.',
        control: { kind: 'toggle' },
        // On: switching the plugin on is already the user asking for the server.
        default: true,
      },
      {
        key: MCP_PREF_KEYS.port,
        label: 'Port',
        description:
          'The port on 127.0.0.1 the server listens on. After changing it, register the ' +
          'client again (the status bar item copies the command).',
        control: { kind: 'number', min: 1024, max: 65535, step: 1 },
        default: DEFAULT_LOCAL_API_PORT,
      },
    ],
  },
}
