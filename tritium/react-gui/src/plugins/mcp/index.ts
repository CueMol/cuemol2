/**
 * @file plugins/mcp/index.ts
 * @description The MCP server: the op catalogue offered to AI clients on this
 * computer as Model Context Protocol tools.
 *
 * Main serves the protocol on 127.0.0.1 (`main/localApi/`); this plugin owns
 * the `mcp` endpoint while it is enabled, relays each request to the worker
 * (`worker/mcp.service.ts`), and shows the server's state in the status bar,
 * whose popover also copies the command that connects a client.
 */

import { definePlugin } from '@renderer/plugin-host/api'
import { mcpManifest } from './manifest'
import { McpRoot } from './renderer/McpRoot'
import { McpStatusItem } from './renderer/McpStatusItem'
import './renderer/mcp.css'

export const mcpPlugin = /* @__PURE__ */ definePlugin({
  manifest: mcpManifest,
  Root: McpRoot,
  statusBarItems: {
    mcp: McpStatusItem,
  },
})
