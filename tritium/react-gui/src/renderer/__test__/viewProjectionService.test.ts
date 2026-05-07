import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '../worker/server/services/viewProjection.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

function makeCtx(initialPerspective = false) {
    const mockView = { perspective: initialPerspective, centerMark: 'crosshair' }
    const getView = vi.fn(() => mockView)
    const ctx = {
        sceMgr: { getView },
    } as unknown as WorkerContext
    return { ctx, mockView, getView }
}

describe('viewProjection service', () => {
    let ctx: WorkerContext
    let mockView: { perspective: boolean; centerMark: string }
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

    it('gets the current center mark', () => {
        mockView.centerMark = 'axis'
        expect(services.getViewCenterMark(ctx, { viewId: 14 })).toEqual({ ok: true, centerMark: 'axis' })
        expect(getView).toHaveBeenCalledWith(14)
    })

    it('sets center mark values', () => {
        expect(services.setViewCenterMark(ctx, { viewId: 15, centerMark: 'none' })).toEqual({
            ok: true,
            centerMark: 'none',
        })
        expect(mockView.centerMark).toBe('none')
        expect(services.setViewCenterMark(ctx, { viewId: 15, centerMark: 'crosshair' })).toEqual({
            ok: true,
            centerMark: 'crosshair',
        })
        expect(mockView.centerMark).toBe('crosshair')
        expect(services.setViewCenterMark(ctx, { viewId: 15, centerMark: 'axis' })).toEqual({
            ok: true,
            centerMark: 'axis',
        })
        expect(mockView.centerMark).toBe('axis')
    })
})
