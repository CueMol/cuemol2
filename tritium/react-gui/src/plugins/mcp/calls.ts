/**
 * @file plugins/mcp/calls.ts
 * @description The MCP plugin's renderer-to-worker call contract.
 *
 * `MCP_KEYS` mirrors the keys as a value so `plugins/index.test.ts` can check
 * the contract against the services the worker actually registers.
 */

import { definePluginServices } from '@renderer/plugin-host/api'
import type { Result } from '@renderer/worker/shared/result'
import type {
  CallToolArgs,
  CancelCallArgs,
  DescribeOutcome,
  ListToolsOutcome,
  CallToolOutcome,
} from './shared/mcpTypes'

// `type`, not `interface`: the plugin service client needs the implicit index
// signature an interface does not have.
export type McpCalls = {
  describe: { args: Record<string, never>; result: Result<DescribeOutcome> }
  listTools: { args: Record<string, never>; result: Result<ListToolsOutcome> }
  callTool: { args: CallToolArgs; result: Result<CallToolOutcome> }
  cancelCall: { args: CancelCallArgs; result: Result }
}

export const MCP_KEYS = [
  'describe',
  'listTools',
  'callTool',
  'cancelCall',
] as const satisfies readonly (keyof McpCalls)[]

/** Typed caller for the services this plugin registers. */
export const mcpServices = definePluginServices<McpCalls>('mcp')
