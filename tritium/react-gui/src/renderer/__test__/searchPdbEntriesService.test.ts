/**
 * Pin the keyword search service: a search with no hits (RCSB answers 204,
 * no body) is an empty success, and the rows keep the search's rank order
 * even though the entry records come back from GraphQL in another order.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchPdbEntries } from '@renderer/worker/server/services/file/entryInfo'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const ctx = {} as WorkerContext
const args = { query: 'photosystem I', method: 'all' as const, sort: 'score' as const, start: 0, rows: 25 }
const originalFetch = globalThis.fetch

function json(body: unknown): Response {
    return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function entry(id: string) {
    return { rcsb_id: id, struct: { title: id }, exptl: [{ method: 'X-RAY DIFFRACTION' }] }
}

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('searchPdbEntries', () => {
    it('treats 204 as no hits and keeps the rank order of the hits', async () => {
        globalThis.fetch = vi.fn(async () => ({ ok: true, status: 204 }) as unknown as Response) as unknown as typeof fetch
        expect(await searchPdbEntries(ctx, args)).toEqual({ ok: true, total: 0, entries: [] })

        globalThis.fetch = vi.fn(async (url: string) => url.includes('search.rcsb.org')
            ? json({ total_count: 40, result_set: [{ identifier: '6VPV' }, { identifier: '1JB0' }] })
            : json({ data: { entries: [entry('1JB0'), entry('6VPV')] } })) as unknown as typeof fetch
        const res = await searchPdbEntries(ctx, args)
        expect(res.ok && res.total).toBe(40)
        expect(res.ok && res.entries.map((e) => e.id)).toEqual(['6vpv', '1jb0'])
    })
})
