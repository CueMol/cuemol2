/**
 * probeMapHeader worker service: parses the CCP4MapReader.probeHeader JSON
 * into the dialog's header info, fails soft when the reader is missing, and
 * the large-map subsample suggestion follows the 256 Mvoxel threshold.
 */
import { describe, it, expect, vi } from 'vitest'
import {
    services,
    suggestSubsample,
    LARGE_MAP_VOXELS,
} from '../worker/server/services/probeMapHeader.service'

function makeCtx(reader: unknown) {
    return {
        strMgr: { createHandler: vi.fn(() => reader) },
    } as never
}

describe('probeMapHeader', () => {
    it('parses the reader JSON', () => {
        const json = JSON.stringify({
            nc: 480, nr: 480, ns: 480, mode: 2, supported: true,
            nvoxels: 110592000, file_bytes_per_voxel: 4, storage_bytes: 110592000,
            start: [0, 0, 0], grid: [480, 480, 480],
            cell: [236.16, 236.16, 236.16, 90, 90, 90], axis: [1, 2, 3],
            ispg: 1, nsymbt: 0, nversion: 0, exttyp: '',
            origin: [0, 0, 0], dmin: -0.32, dmax: 1.05, dmean: 0, rms: 0.026,
        })
        const probeHeader = vi.fn(() => json)
        const res = services.probeMapHeader(makeCtx({ probeHeader }), { filePath: '/x/emd.map' })
        expect(probeHeader).toHaveBeenCalledWith('/x/emd.map')
        expect(res.ok).toBe(true)
        expect(res.info).toMatchObject({
            nc: 480, nr: 480, ns: 480, mode: 2, supported: true,
            nvoxels: 110592000, storageBytes: 110592000, ispg: 1, exttyp: '',
            origin: [0, 0, 0], rms: 0.026,
        })
    })

    it('fails soft when the reader is unavailable or throws', () => {
        expect(services.probeMapHeader(makeCtx(null), { filePath: '/x' })).toEqual({ ok: false, info: null })
        const probeHeader = vi.fn(() => { throw new Error('not a map') })
        expect(services.probeMapHeader(makeCtx({ probeHeader }), { filePath: '/x' })).toEqual({ ok: false, info: null })
    })
})

describe('suggestSubsample', () => {
    it('keeps the stored voxel count under the large-map threshold', () => {
        expect(suggestSubsample(100)).toBe(1)
        expect(suggestSubsample(LARGE_MAP_VOXELS)).toBe(1)
        expect(suggestSubsample(LARGE_MAP_VOXELS + 1)).toBe(2)
        expect(suggestSubsample(1200 * 1200 * 1200)).toBe(2)   // 1.73 G -> 216 M at 2
        expect(suggestSubsample(2000 * 2000 * 2000)).toBe(4)   // 8 G -> 1 G at 2, 125 M at 4
        expect(suggestSubsample(1e12)).toBe(8)                 // capped
    })
})
