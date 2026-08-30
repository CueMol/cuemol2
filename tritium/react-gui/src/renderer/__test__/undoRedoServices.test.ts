import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services as undoServices } from '@renderer/worker/server/services/undo.service'
import { services as redoServices } from '@renderer/worker/server/services/redo.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const { undo: undoFn, getUndoState: getUndoStateFn, clearUndoData: clearUndoDataFn } = undoServices
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

describe('getUndoState service', () => {
    function makeUndoStateCtx(opts: {
        undoDescs?: string[]
        redoDescs?: string[]
        undoable?: boolean
        redoable?: boolean
        sceneNull?: boolean
    } = {}) {
        const undoDescs = opts.undoDescs ?? []
        const redoDescs = opts.redoDescs ?? []
        const scene = {
            isUndoable: vi.fn(() => opts.undoable ?? undoDescs.length > 0),
            isRedoable: vi.fn(() => opts.redoable ?? redoDescs.length > 0),
            getUndoSize: vi.fn(() => undoDescs.length),
            getRedoSize: vi.fn(() => redoDescs.length),
            getUndoDesc: vi.fn((i: number) => undoDescs[i]),
            getRedoDesc: vi.fn((i: number) => redoDescs[i]),
        }
        const ctx = {
            sceMgr: { getScene: vi.fn(() => (opts.sceneNull ? null : scene)) },
        } as unknown as WorkerContext
        return { ctx, scene }
    }

    it('is registered as "getUndoState"', () => {
        expect('getUndoState' in undoServices).toBe(true)
    })

    it('collects descriptions in index order (0 = most recent)', () => {
        const { ctx, scene } = makeUndoStateCtx({
            undoDescs: ['add obj', 'color', 'rename'],
            redoDescs: ['delete'],
        })
        const state = getUndoStateFn(ctx, { sceneId: 1 })
        expect(state).toEqual({
            canUndo: true,
            canRedo: true,
            undoDescs: ['add obj', 'color', 'rename'],
            redoDescs: ['delete'],
        })
        expect(scene.getUndoDesc).toHaveBeenNthCalledWith(1, 0)
        expect(scene.getUndoDesc).toHaveBeenNthCalledWith(3, 2)
    })

    it('reports both stacks empty when there is nothing to undo/redo', () => {
        const { ctx } = makeUndoStateCtx({})
        expect(getUndoStateFn(ctx, { sceneId: 1 })).toEqual({
            canUndo: false,
            canRedo: false,
            undoDescs: [],
            redoDescs: [],
        })
    })

    it('returns the empty state when the scene is missing', () => {
        const { ctx } = makeUndoStateCtx({ sceneNull: true })
        expect(getUndoStateFn(ctx, { sceneId: 99 })).toEqual({
            canUndo: false,
            canRedo: false,
            undoDescs: [],
            redoDescs: [],
        })
    })
})

describe('clearUndoData service', () => {
    it('is registered as "clearUndoData"', () => {
        expect('clearUndoData' in undoServices).toBe(true)
    })

    it('calls scene.clearUndoData()', () => {
        const clear = vi.fn()
        const ctx = {
            sceMgr: { getScene: vi.fn(() => ({ clearUndoData: clear })) },
        } as unknown as WorkerContext
        expect(clearUndoDataFn(ctx, { sceneId: 1 })).toEqual({ ok: true })
        expect(clear).toHaveBeenCalled()
    })

    it('returns { ok: false } without touching anything when the scene is missing', () => {
        const ctx = {
            sceMgr: { getScene: vi.fn(() => null) },
        } as unknown as WorkerContext
        expect(clearUndoDataFn(ctx, { sceneId: 99 })).toEqual({ ok: false })
    })
})
