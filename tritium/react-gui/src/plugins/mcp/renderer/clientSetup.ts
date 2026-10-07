/**
 * @file plugins/mcp/renderer/clientSetup.ts
 * @description What to paste into each MCP client to connect it to CueMol.
 *
 * Every client gets the same thing -- the URL and the bearer token over
 * Streamable HTTP -- written the way that client reads it.
 */

export type McpClientId = 'claude' | 'codex' | 'antigravity' | 'other'

export interface McpClientSetup {
  id: McpClientId
  label: string
  /** Where the snippet goes, shown above it. */
  where: string
  /** Anything else worth knowing for this client, shown under it. */
  note?: string
  snippet(url: string, token: string): string
}

export const MCP_CLIENTS: readonly McpClientSetup[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    where: 'Run this in a terminal:',
    snippet: (url, token) =>
      `claude mcp add --transport http cuemol ${url} --header "Authorization: Bearer ${token}"`,
  },
  {
    id: 'codex',
    label: 'Codex',
    where: 'Add this to ~/.codex/config.toml:',
    note:
      'Codex stops a tool after 60 seconds unless told otherwise; tool_timeout_sec lets a long ' +
      'render finish.',
    snippet: (url, token) =>
      [
        '[mcp_servers.cuemol]',
        `url = "${url}"`,
        `http_headers = { "Authorization" = "Bearer ${token}" }`,
        'tool_timeout_sec = 1800',
      ].join('\n'),
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    where: 'Add this to ~/.gemini/config/mcp_config.json:',
    note: 'If the file already lists other servers, add the "cuemol" entry to its mcpServers.',
    snippet: (url, token) =>
      JSON.stringify(
        { mcpServers: { cuemol: { serverUrl: url, headers: { Authorization: `Bearer ${token}` } } } },
        null,
        2,
      ),
  },
  {
    id: 'other',
    label: 'Other',
    where: 'Any MCP client that speaks Streamable HTTP and can send a header:',
    snippet: (url, token) =>
      [`URL:       ${url}`, 'Transport: Streamable HTTP', `Header:    Authorization: Bearer ${token}`].join('\n'),
  },
]

/** Shown in place of the token, which is filled in only when copied. */
export const TOKEN_PLACEHOLDER = '<token>'
