import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '../worker/services/viewProjection.service'
import type { WorkerContext } from '../worker/types/WorkerContext'

function makeCtx(initialPerspective = false) {
    const mockView = { perspective: initialPerspective }
    const getView = vi.fn(() => mockView)
    const ctx = {
        sceMgr: { getView },
    } as unknown as WorkerContext
    return { ctx, mockView, getView }
}

describe('viewProjection service', () => {
    let ctx: WorkerContext
    let mockView: { perspective: boolean }
    let getView: ReturnType<typeof vi.fn>

    beforeEach(() => {
        const m = makeCtx(false)
        ctx = m.ctx
        mockView = m.mockView
        getView = m.getView
    })

    it('gets the current view projection', () => {
        mockView.perspective = true
        expect(services.getViewProjection(ctx, { viewId: 11 })).toEqual({ ok: true, perspective: true })
        expect(getView).toHaveBeenCalledWith(11)
    })

    it('sets perspective projection', () => {
        expect(services.setViewProjection(ctx, { viewId: 12, perspective: true })).toEqual({
            ok: true,
            perspective: true,
        })
        expect(mockView.perspective).toBe(true)
        expect(getView).toHaveBeenCalledWith(12)
    })

    it('sets orthographic projection', () => {
        mockView.perspective = true
        expect(services.setViewProjection(ctx, { viewId: 13, perspective: false })).toEqual({
            ok: true,
            perspective: false,
        })
        expect(mockView.perspective).toBe(false)
    })
})
