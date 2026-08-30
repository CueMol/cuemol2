/**
 * Tests for getMtzColumnInfo (worker service).
 *
 * Pins the UXP onInit contract: create the 'mtzmap' reader, setPath, call
 * getColumnInfoJSON(), keep only F/P/W columns, and read min_res / max_res /
 * resolution off the reader (populated as a side effect of the header parse).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

import { services } from '@renderer/worker/server/services/getMtzColumnInfo.service'
const { getMtzColumnInfo } = services

function makeCtx(opts: {
    json?: string
    createNull?: boolean
    getColumnThrows?: boolean
} = {}) {
    const reader = {
        setPath: vi.fn(),
        getColumnInfoJSON: vi.fn(() => {
            if (opts.getColumnThrows) throw new Error('bad mtz')
            return opts.json ?? '[]'
        }),
        min_res: 50.0,
        max_res: 1.8,
        resolution: 1.8,
    }
    const createHandler = vi.fn(() => (opts.createNull ? null : reader))
    const ctx = { strMgr: { createHandler } } as unknown as WorkerContext
    return { ctx, reader, createHandler }
}

describe('getMtzColumnInfo service', () => {
    beforeEach(() => vi.clearAllMocks())

    it('creates mtzmap reader, sets path, returns F/P/W columns + resolution range', () => {
        const json = JSON.stringify([
            { nid: 0, name: 'H', type: 'H' },
            { nid: 3, name: 'FWT', type: 'F' },
            { nid: 4, name: 'PHWT', type: 'P' },
            { nid: 5, name: 'FOM', type: 'W' },
        ])
        const { ctx, reader, createHandler } = makeCtx({ json })
        const result = getMtzColumnInfo(ctx, { filePath: '/data/x.mtz' })

        expect(createHandler).toHaveBeenCalledWith('mtzmap', 0)
        expect(reader.setPath).toHaveBeenCalledWith('/data/x.mtz')
        expect(result.ok).toBe(true)
        // H/index columns are filtered out.
        expect(result.columns).toEqual([
            { name: 'FWT', type: 'F' },
            { name: 'PHWT', type: 'P' },
            { name: 'FOM', type: 'W' },
        ])
        expect(result).toMatchObject({ minRes: 50.0, maxRes: 1.8, resolution: 1.8 })
    })

    it('returns ok:false when createHandler fails', () => {
        const { ctx } = makeCtx({ createNull: true })
        expect(getMtzColumnInfo(ctx, { filePath: '/data/x.mtz' })).toMatchObject({ ok: false, columns: [] })
    })

    it('returns ok:false when getColumnInfoJSON throws', () => {
        const { ctx } = makeCtx({ getColumnThrows: true })
        expect(getMtzColumnInfo(ctx, { filePath: '/data/x.mtz' })).toMatchObject({ ok: false, columns: [] })
    })
})
