/**
 * @file shared/mcpResult.ts
 * @description An MCP `tools/call` result in the shape every CueMol tool
 * answers with: one text block holding `{ ok: true, result }` or
 * `{ ok: false, error }` as JSON.
 *
 * The server's instructions promise that shape (catalog/guide.ts), so a reply
 * made anywhere else -- main when the window does not answer, the window for
 * the scene tools, the worker before an op runs -- is built here rather than
 * as plain text. An op's own outcome goes through the catalogue's
 * `serializeToolOutput`, which writes the same JSON.
 */

/** A `tools/call` result, structurally the SDK's `CallToolResult`. */
export interface McpTextResult {
  content: { type: 'text'; text: string }[]
  isError: boolean
}

/** A successful call's result. */
export function mcpOkResult(result: unknown): McpTextResult {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, result }) }], isError: false }
}

/** A failed call's result: still a result, with `isError`, not a protocol error. */
export function mcpErrorResult(error: string): McpTextResult {
  return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error }) }], isError: true }
}
