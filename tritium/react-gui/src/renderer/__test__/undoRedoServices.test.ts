import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services as undoServices } from '../worker/server/services/undo.service'
import { services as redoServices } from '../worker/server/services/redo.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

const { undo: undoFn } = undoServices
const { redo: redoFn } = redoServices

function makeCtx() {
    const mockUndo = vi.fn(() => true)
    const mockRedo = vi.fn(() => true)
    const mockScene = { undo: mockUndo, redo: mockRedo }
    const ctx = {
        sceMgr: { getScene: vi.fn(() => mockScene) },
    } as unknown as WorkerContext
    return { ctx, mockScene, mockUndo, mockRedo }
}

describe('undo service', () => {
    let ctx: WorkerContext
    let mockUndo: ReturnType<typeof vi.fn>

    beforeEach(() => {
        const m = makeCtx()
        ctx = m.ctx
        mockUndo = m.mockUndo
    })

    it('is registered as "undo"', () => {
        expect('undo' in undoServices).toBe(true)
    })

    it('calls scene.undo(0) by default', () => {
        undoFn(ctx, { sceneId: 1 })
        expect(mockUndo).toHaveBeenCalledWith(0)
    })

    it('passes depth to scene.undo', () => {
        undoFn(ctx, { sceneId: 1, depth: 2 })
        expect(mockUndo).toHaveBeenCalledWith(2)
    })

    it('returns { ok: true } when scene.undo returns true', () => {
        mockUndo.mockReturnValue(true)
        expect(undoFn(ctx, { sceneId: 1 })).toEqual({ ok: true })
    })

    it('returns { ok: false } when scene.undo returns false', () => {
        mockUndo.mockReturnValue(false)
        expect(undoFn(ctx, { sceneId: 1 })).toEqual({ ok: false })
    })
})

describe('redo service', () => {
    let ctx: WorkerContext
    let mockRedo: ReturnType<typeof vi.fn>

    beforeEach(() => {
        const m = makeCtx()
        ctx = m.ctx
        mockRedo = m.mockRedo
    })

    it('is registered as "redo"', () => {
        expect('redo' in redoServices).toBe(true)
    })

    it('calls scene.redo(0) by default', () => {
        redoFn(ctx, { sceneId: 1 })
        expect(mockRedo).toHaveBeenCalledWith(0)
    })

    it('passes depth to scene.redo', () => {
        redoFn(ctx, { sceneId: 1, depth: 3 })
        expect(mockRedo).toHaveBeenCalledWith(3)
    })

    it('returns { ok: true } when scene.redo returns true', () => {
        mockRedo.mockReturnValue(true)
        expect(redoFn(ctx, { sceneId: 1 })).toEqual({ ok: true })
    })

    it('returns { ok: false } when scene.redo returns false', () => {
        mockRedo.mockReturnValue(false)
        expect(redoFn(ctx, { sceneId: 1 })).toEqual({ ok: false })
    })
})
