/**
 * Pin how fetch_emdb finds the map to fetch: an EMDB code in any spelling is
 * taken as is, a cryo-EM PDB ID resolves to its first EMDB map, and a PDB
 * entry with no map fails with a reason instead of fetching nothing.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveEmdbId } from '@renderer/worker/server/services/map/fetchEmdbMap'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const ctx = {} as WorkerContext
const originalFetch = globalThis.fetch

function entries(...list: { id: string; emdb: string[] }[]): typeof fetch {
    return vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            data: {
                entries: list.map((e) => ({
                    rcsb_id: e.id,
                    exptl: [{ method: 'ELECTRON MICROSCOPY' }],
                    rcsb_entry_container_identifiers: { emdb_ids: e.emdb },
                })),
            },
        }),
    }) as unknown as Response) as unknown as typeof fetch
}

afterEach(() => {
    globalThis.fetch = originalFetch
})

describe('resolveEmdbId', () => {
    it('takes a code as is, resolves a PDB ID to its first map, and refuses an entry without one', async () => {
        globalThis.fetch = vi.fn() as unknown as typeof fetch
        expect(await resolveEmdbId(ctx, 'emd_11638')).toEqual({ ok: true, emdbId: 'EMD-11638' })
        expect(globalThis.fetch).not.toHaveBeenCalled()

        globalThis.fetch = entries({ id: '7A4M', emdb: ['EMD-11638', 'EMD-11639'] })
        expect(await resolveEmdbId(ctx, '7a4m')).toEqual({ ok: true, emdbId: 'EMD-11638' })

        globalThis.fetch = entries({ id: '1MBN', emdb: [] })
        expect(await resolveEmdbId(ctx, '1mbn')).toMatchObject({ ok: false, code: 'not-found' })
    })
})
