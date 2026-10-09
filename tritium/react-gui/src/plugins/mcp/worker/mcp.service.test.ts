/**
 * @file plugins/mcp/worker/mcp.service.test.ts
 * @description What one MCP tool call does to the scene and what it returns.
 *
 * The contract a client relies on: one call is one undo step labelled after
 * the tool, a picture comes back as MCP image content, and a call made while
 * another action holds a transaction is refused rather than run inside it --
 * except an op that has to run outside one (saving or opening a scene).
 *
 * The op is stubbed; the transaction bookkeeping is the real one.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

vi.mock('@renderer/worker/server/catalog', async (importOriginal) => {
  const real = await importOriginal<typeof import('@renderer/worker/server/catalog')>()
  const op = { name: 'paint', description: 'stub', mutates: true, expose: { tool: 'core' } }
  // Stands for load_file of a .qsc: MCP-only, outside any transaction.
  const open = {
    name: 'open',
    description: 'stub',
    mutates: false,
    expose: { tool: false, console: true, mcp: true },
    outsideTxn: (args: Record<string, unknown>) => String(args.path).endsWith('.qsc'),
  }
  return {
    ...real,
    findOp: (name: string) => [op, open].find((o) => o.name === name),
    readToolArgs: (_op: unknown, input: Record<string, unknown>) => input,
    invokeOp: async (o: { name: string }, _ctx: unknown, _input: unknown, oc: { markMutated(): void; openScene?(p: string): void }) => {
      if (o.name === 'open') {
        oc.openScene?.('/w/a.qsc')
        return { ok: true, data: {} }
      }
      oc.markMutated()
      return { ok: true, data: { done: true }, image: { mediaType: 'image/png', base64: 'AAAA' } }
    },
  }
})

import { runInTxn, TXN_BUSY_MESSAGE } from '@renderer/worker/server/catalog'
import { fakeScene, fakeView, makeWorkerCtx } from '@renderer/worker/testing'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { services } from './mcp.service'

function setup() {
  const scene = fakeScene({ uid: 1, views: [fakeView({ uid: 2 })] })
  const { ctx } = makeWorkerCtx({ scenes: [scene] })
  return { scene, ctx: ctx as unknown as WorkerContext }
}

const CALL = { callId: 'mcp-1', name: 'paint', arguments: {}, sceneId: 1, viewId: 2 }

describe('an MCP tool call', () => {
  it('is one undo step and returns the picture as image content', async () => {
    const { scene, ctx } = setup()
    const res = await services.callTool(ctx, CALL)
    expect(scene.undo.committed).toEqual(['MCP: paint'])
    expect(res.ok && res.isError).toBe(false)
    expect(res.ok && res.content.map((c) => c.type)).toEqual(['text', 'image'])
  })

  it('runs an outside-transaction op with no transaction, and hands a scene file to the window', async () => {
    const { scene, ctx } = setup()
    const res = await services.callTool(ctx, { ...CALL, name: 'open', arguments: { path: '/w/a.qsc' } })
    expect(scene.undo.started).toEqual([])
    expect(res.ok && res.openScene).toBe('/w/a.qsc')
  })

  it('is refused while another transaction is open', async () => {
    const { scene, ctx } = setup()
    let release: () => void = () => undefined
    const other = runInTxn(scene as never, 'Console: x', () => false, () =>
      new Promise<void>((resolve) => { release = resolve }),
    )
    const res = await services.callTool(ctx, CALL)
    release()
    await other
    expect(res.ok && res.isError).toBe(true)
    expect(res.ok && res.content[0]).toEqual({ type: 'text', text: JSON.stringify({ ok: false, error: TXN_BUSY_MESSAGE }) })
    expect(scene.undo.committed).toEqual([])
  })
})
