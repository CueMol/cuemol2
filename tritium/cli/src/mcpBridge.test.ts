/**
 * @file mcpBridge.test.ts
 * @description The stdio <-> /mcp relay: the client sees its own ids, and two
 * bridges never share an id the app keys calls by.
 */

import { describe, expect, it } from 'vitest'
import { createMcpBridge } from './mcpBridge'
import type { McpPost } from './mcpBridge'

/** A bridge whose app answers every request with its id and records what it was sent. */
function bridge(prefix: string, sent: unknown[], answer?: McpPost) {
  const out: unknown[] = []
  const post: McpPost =
    answer ??
    (async (body) => {
      sent.push(body)
      const m = body as { id?: string; method: string }
      if (m.id === undefined) return { status: 202, text: '' }
      return { status: 200, text: JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { echoed: m.method } }) }
    })
  return { out, b: createMcpBridge({ prefix, post, write: (l) => out.push(JSON.parse(l)) }) }
}

describe('MCP bridge', () => {
  it('answers with the client id, writes nothing for a notification, and an error when the app is gone', async () => {
    const sent: unknown[] = []
    const { out, b } = bridge('p-', sent)
    await b.handleLine('{"jsonrpc":"2.0","id":7,"method":"tools/list"}')
    await b.handleLine('{"jsonrpc":"2.0","method":"notifications/initialized"}')
    expect(sent).toEqual([{ jsonrpc: '2.0', id: 'p-1', method: 'tools/list' }, { jsonrpc: '2.0', method: 'notifications/initialized' }])
    expect(out).toEqual([{ jsonrpc: '2.0', id: 7, result: { echoed: 'tools/list' } }])

    const gone = bridge('q-', [], async () => {
      throw new Error('CueMol is not running')
    })
    await gone.b.handleLine('{"jsonrpc":"2.0","id":"a","method":"tools/call"}')
    expect(gone.out).toEqual([{ jsonrpc: '2.0', id: 'a', error: { code: -32000, message: 'CueMol is not running' } }])
  })

  it('keeps two bridges with the same client ids apart, cancels included', async () => {
    const sent: { id?: string; params?: { requestId?: string } }[] = []
    // Calls that never answer, so they are still in flight when the cancel comes.
    const hang: McpPost = async (body) => {
      sent.push(body as never)
      if ((body as { id?: string }).id === undefined) return { status: 202, text: '' }
      return new Promise(() => {})
    }
    const one = bridge('one-', [], hang).b
    const two = bridge('two-', [], hang).b
    const call = '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"render_image"}}'
    void one.handleLine(call)
    void two.handleLine(call)
    await one.handleLine('{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1}}')
    await two.handleLine('{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1}}')
    expect(sent.map((m) => m.id ?? m.params?.requestId)).toEqual(['one-1', 'two-1', 'one-1', 'two-1'])
  })
})
