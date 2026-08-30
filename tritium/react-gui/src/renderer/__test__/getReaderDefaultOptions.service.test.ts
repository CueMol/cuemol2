/**
 * Degrade-detection tests for `getReaderDefaultOptions` (worker service).
 *
 * The file-open dialog must source reader-option defaults from the C++ reader
 * (qif/constructor), never from TS-hardcoded values. This service reads those
 * defaults off a freshly created handler. The tests pin the per-nickname
 * property set the service reads + returns, so a future rename / typo of a
 * reader property (which would silently revert to wrong defaults, e.g. the
 * `autoTopoGen` topology regression) is caught.
 */
import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { services } from '@renderer/worker/server/services/getReaderDefaultOptions.service'

const { getReaderDefaultOptions } = services

// Sentinel reader-property bag: every property the service might read is given
// a distinctive value so the test asserts the exact set that was read through.
function makeCtx(bag: Record<string, unknown>): { ctx: WorkerContext; createHandler: ReturnType<typeof vi.fn> } {
    const createHandler = vi.fn(() => bag)
    const ctx = { strMgr: { createHandler } } as unknown as WorkerContext
    return { ctx, createHandler }
}

describe('getReaderDefaultOptions', () => {
    it('reads PDB reader props (incl. autoTopoGen) off the handler', () => {
        const { ctx, createHandler } = makeCtx({
            loadmodel: false, loadanisou: true, loadaltconf: true,
            loadsegid: false, build2ndry: true, autoTopoGen: true,
            // not part of the pdb set -- must be ignored:
            normalize: true, loadsecstr: true,
        })
        const res = getReaderDefaultOptions(ctx, { nickname: 'pdb' })
        expect(createHandler).toHaveBeenCalledWith('pdb', 0)
        expect(res).toEqual({
            ok: true,
            values: {
                loadmodel: false, loadanisou: true, loadaltconf: true,
                loadsegid: false, build2ndry: true, autoTopoGen: true,
            },
        })
    })

    it('reads mmCIF reader props (loadsecstr instead of build2ndry/loadsegid)', () => {
        const { ctx } = makeCtx({
            loadmodel: false, loadanisou: true, loadaltconf: true,
            loadsecstr: false, autoTopoGen: true,
        })
        const res = getReaderDefaultOptions(ctx, { nickname: 'mmcif' })
        expect(res).toEqual({
            ok: true,
            values: {
                loadmodel: false, loadanisou: true, loadaltconf: true,
                loadsecstr: false, autoTopoGen: true,
            },
        })
        // build2ndry / loadsegid are not mmCIF reader props.
        expect(res.values).not.toHaveProperty('build2ndry')
        expect(res.values).not.toHaveProperty('loadsegid')
    })

    it('reads CCP4 map reader props', () => {
        const { ctx } = makeCtx({
            normalize: false, truncate_min: false, min: 0,
            truncate_max: false, max: 5,
        })
        const res = getReaderDefaultOptions(ctx, { nickname: 'ccp4map' })
        expect(res).toEqual({
            ok: true,
            values: { normalize: false, truncate_min: false, min: 0, truncate_max: false, max: 5 },
        })
    })

    it('returns empty values without creating a handler for option-less readers', () => {
        const { ctx, createHandler } = makeCtx({})
        const res = getReaderDefaultOptions(ctx, { nickname: 'msms' })
        expect(res).toEqual({ ok: true, values: {} })
        expect(createHandler).not.toHaveBeenCalled()
    })

    it('reports failure when the handler cannot be created', () => {
        const createHandler = vi.fn(() => null)
        const ctx = { strMgr: { createHandler } } as unknown as WorkerContext
        const res = getReaderDefaultOptions(ctx, { nickname: 'pdb' })
        expect(res).toEqual({ ok: false, values: {} })
    })
})
