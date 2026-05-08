import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/validateSelection.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

function makeCtx(compileResult: boolean | null) {
    // compileResult === null → createObj returns null
    // compileResult === true/false → createObj returns a SelCommand stub whose compile() returns that
    const sel = compileResult === null ? null : { compile: vi.fn(() => compileResult) }
    return {
        svc: { createObj: vi.fn(() => sel) },
    } as unknown as WorkerContext
}

describe('validateSelection service', () => {
    it('returns ok:true for a valid selection string', () => {
        const ctx = makeCtx(true)
        expect(services.validateSelection(ctx, { selStr: 'chain.A', sceneId: 1 })).toEqual({ ok: true })
    })

    it('returns ok:false when compile() fails', () => {
        const ctx = makeCtx(false)
        expect(services.validateSelection(ctx, { selStr: 'bogus', sceneId: 1 })).toEqual({ ok: false })
    })

    it('returns ok:false when SelCommand cannot be created', () => {
        const ctx = makeCtx(null)
        expect(services.validateSelection(ctx, { selStr: 'chain.A', sceneId: 1 })).toEqual({ ok: false })
    })

    it('treats empty string as ok (skips compile)', () => {
        // makeSel returns the SelCommand without calling compile when selStr is empty.
        const ctx = makeCtx(false) // compile would fail, but should not be called
        expect(services.validateSelection(ctx, { selStr: '', sceneId: 1 })).toEqual({ ok: true })
    })
})
