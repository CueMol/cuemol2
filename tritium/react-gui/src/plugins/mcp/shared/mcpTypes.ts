/**
 * @file plugins/mcp/shared/mcpTypes.ts
 * @description The MCP plugin's ids and its renderer-to-worker payloads.
 *
 * The result shapes are MCP's own (`tools/list`, `tools/call`), so main can
 * hand them to the client without translating them.
 */

export const MCP_PLUGIN_ID = 'mcp'

/** Plugin preference keys. */
export const MCP_PREF_KEYS = {
  /** Whether the server accepts connections (the plugin being on shows the controls). */
  serverEnabled: 'serverEnabled',
  /** The local API port; shared with any other endpoint main serves. */
  port: 'port',
} as const

/** One tool as `tools/list` describes it. */
export interface McpToolDecl {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** A block of a `tools/call` result. */
export type McpContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }

/** A `tools/call` result. A failed call is a result with `isError`, not a protocol error. */
export interface McpCallResult {
  content: McpContent[]
  isError: boolean
}

export interface DescribeOutcome {
  /** What the client is told on `initialize`. */
  instructions: string
}

export interface ListToolsOutcome {
  tools: McpToolDecl[]
}

export interface CallToolArgs {
  /** Unique per call; a cancel names it. */
  callId: string
  name: string
  arguments: Record<string, unknown>
  /** 0 when no scene is open. */
  sceneId: number
  viewId: number
}

export interface CancelCallArgs {
  callId: string
}
