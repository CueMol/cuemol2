/**
 * @file plugins/agent/worker/modelList.test.ts
 * @description What each provider's list request sends and how its answer is read.
 *
 * Only a real request would show a wrong header or a missed page, so the
 * wire shape is pinned here: the key goes in the provider's own header, the
 * list is followed to its last page, and Gemini's `models/` prefix is dropped
 * so the ids compare with the ones a turn is sent with.
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { listModels } from './modelList'
import type { Fetch } from './modelList'

const ctx = {} as WorkerContext

function reply(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response
}

describe('listing the models a key may call', () => {
  it('follows Gemini pages, with the key in its header, and strips the prefix', async () => {
    const doFetch = vi.fn<Fetch>()
      .mockResolvedValueOnce(reply({ models: [{ name: 'models/gemini-a' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(reply({ models: [{ name: 'models/gemini-b' }] }))

    const res = await listModels(ctx, { provider: 'google', apiKey: 'k' }, doFetch)

    expect(res).toEqual({ ok: true, ids: ['gemini-a', 'gemini-b'] })
    expect(doFetch.mock.calls[1][0]).toContain('pageToken=p2')
    expect(doFetch.mock.calls[0][1].headers).toEqual({ 'x-goog-api-key': 'k' })
  })

  it('reports an HTTP failure as a result, naming the provider', async () => {
    const doFetch = vi.fn<Fetch>().mockResolvedValue(reply({}, 401))
    const res = await listModels(ctx, { provider: 'anthropic', apiKey: 'k' }, doFetch)
    expect(res).toMatchObject({ ok: false, code: 'io' })
    expect(!res.ok && res.error).toContain('Anthropic')
  })
})
