/**
 * @file main/localApi/mcpEndpoint.ts
 * @description The MCP endpoint (`/mcp`): Streamable HTTP, stateless.
 *
 * Main speaks the protocol and nothing else. What the tools are, and running
 * one, belong to the op catalogue in the worker, so `tools/list` and
 * `tools/call` are relayed to the main window (`mcp` plugin) and its answer is
 * returned as is.
 *
 * Stateless (no session id): every POST gets a fresh SDK `Server` and
 * transport, so nothing has to be kept per client. The one thing that does
 * span requests is cancellation -- `notifications/cancelled` arrives on its
 * own POST, naming the request id of a call still running on another -- so
 * running calls are kept by request id here and the notification is handled
 * before the SDK sees it.
 *
 * The tools are not registered through `McpServer.registerTool`, which wants
 * zod schemas; the list and call handlers are set on its underlying protocol
 * server, so the catalogue's JSON Schema goes out as generated.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CallToolResult, ListToolsResult } from '@modelcontextprotocol/sdk/types.js'
import type { LocalApiRelay } from './relay'
import type { EndpointHandler } from './server'

/** What the renderer answers to `describe`. */
interface McpDescribe {
  instructions: string
}

/** Calls still running, by JSON-RPC request id, so a cancel can reach them. */
const running = new Map<string, AbortController>()

/** The request ids a `notifications/cancelled` body names; empty when it is something else. */
export function cancelledRequestIds(body: unknown): string[] {
  const msgs = Array.isArray(body) ? body : [body]
  const ids: string[] = []
  for (const m of msgs) {
    if (!m || typeof m !== 'object') return []
    const msg = m as { method?: unknown; params?: { requestId?: unknown } }
    if (msg.method !== 'notifications/cancelled') return []
    if (msg.params?.requestId !== undefined) ids.push(String(msg.params.requestId))
  }
  return ids
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/**
 * Create the endpoint.
 *
 * @param version - the app version, reported to the client as the server's
 */
export function mcpEndpoint(relay: LocalApiRelay, version: string): EndpointHandler {
  let instructions: string | null = null

  async function describe(): Promise<string> {
    if (instructions === null) {
      const d = (await relay.request('mcp', 'describe', {})) as McpDescribe
      instructions = d.instructions
    }
    return instructions
  }

  async function makeServer(): Promise<McpServer> {
    const mcp = new McpServer(
      { name: 'cuemol', version },
      { capabilities: { tools: {} }, instructions: await describe() },
    )
    const server = mcp.server
    server.setRequestHandler(ListToolsRequestSchema, async () =>
      (await relay.request('mcp', 'listTools', {})) as ListToolsResult,
    )
    server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
      const key = String(extra.requestId)
      const ac = new AbortController()
      const onAbort = () => ac.abort()
      extra.signal.addEventListener('abort', onAbort, { once: true })
      running.set(key, ac)
      try {
        return (await relay.request(
          'mcp',
          'callTool',
          { name: req.params.name, arguments: req.params.arguments ?? {} },
          ac.signal,
        )) as CallToolResult
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : 'The call failed.')
      } finally {
        extra.signal.removeEventListener('abort', onAbort)
        if (running.get(key) === ac) running.delete(key)
      }
    })
    return mcp
  }

  return {
    endpoint: 'mcp',
    paths: ['/mcp'],
    async handle(req: IncomingMessage, res: ServerResponse, body: unknown) {
      if (req.method !== 'POST') {
        // Stateless: no server-initiated stream (GET) and no session to end (DELETE).
        res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }))
        return
      }
      const cancelled = cancelledRequestIds(body)
      if (cancelled.length > 0) {
        for (const id of cancelled) running.get(id)?.abort()
        res.writeHead(202).end()
        return
      }
      const server = await makeServer()
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      res.on('close', () => {
        void transport.close()
        void server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    },
  }
}
