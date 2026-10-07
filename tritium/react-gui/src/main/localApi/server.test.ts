/**
 * @file main/localApi/server.test.ts
 * @description Who the local API server lets in, and where it sends them.
 *
 * Runs the real listener on a free port. The checks are the security
 * contract (no token, a foreign origin, an endpoint that is off) and the one
 * path every endpoint shares: an MCP request relayed to the window as
 * `{ endpoint, kind, payload }` with the window's answer sent back.
 */

import { describe, it, expect, afterEach } from 'vitest'
import * as net from 'net'
import { createLocalApiServer } from './server'
import type { LocalApiServer } from './server'
import { mcpEndpoint } from './mcpEndpoint'
import type { LocalApiRelay } from './relay'

const TOKEN = 'test-token'

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port
      s.close(() => resolve(port))
    })
  })
}

/** A relay that answers like the MCP plugin would, recording what it was asked. */
function fakeRelay(asked: { endpoint: string; kind: string; payload: unknown }[]): LocalApiRelay {
  return {
    async request(endpoint, kind, payload) {
      asked.push({ endpoint, kind, payload })
      switch (kind) {
        case 'describe': return { instructions: 'Use the tools.' }
        case 'listTools': return { tools: [{ name: 'paint', description: 'Paint.', inputSchema: { type: 'object' } }] }
        case 'callTool': return { content: [{ type: 'text', text: '{"ok":true}' }], isError: false }
        default: throw new Error(kind)
      }
    },
    reply: () => undefined,
    failAll: () => undefined,
  }
}

let server: LocalApiServer | null = null
afterEach(async () => {
  await server?.stop()
  server = null
})

async function start(asked: { endpoint: string; kind: string; payload: unknown }[] = []) {
  const port = await freePort()
  server = createLocalApiServer({ handlers: [mcpEndpoint(fakeRelay(asked), '0.0.0')], token: () => TOKEN, port })
  return { port, asked }
}

function rpc(port: number, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${TOKEN}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const LIST = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }

describe('the local API server', () => {
  it('refuses a missing token, a foreign origin, and an endpoint that is off', async () => {
    const { port } = await start()
    await server!.setEndpoint('mcp', true)
    expect((await rpc(port, LIST, { Authorization: '' })).status).toBe(401)
    expect((await rpc(port, LIST, { Origin: 'http://evil.example' })).status).toBe(403)
    // Another endpoint keeps the listener open while MCP is off.
    await server!.setEndpoint('console', true)
    await server!.setEndpoint('mcp', false)
    expect((await rpc(port, LIST)).status).toBe(404)
  })

  it('relays tools/list and tools/call to the window and returns its answer', async () => {
    const { port, asked } = await start()
    await server!.setEndpoint('mcp', true)

    const list = await (await rpc(port, LIST)).json()
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(['paint'])

    const call = await (await rpc(port, {
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'paint', arguments: { color: 'red' } },
    })).json()
    expect(call.result).toEqual({ content: [{ type: 'text', text: '{"ok":true}' }], isError: false })
    expect(asked).toContainEqual({ endpoint: 'mcp', kind: 'callTool', payload: { name: 'paint', arguments: { color: 'red' } } })
  })
})
