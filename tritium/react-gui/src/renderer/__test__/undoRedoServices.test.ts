import { describe, it, expect, vi } from 'vitest'
import { services as undoServices } from '@renderer/worker/server/services/undo/undo.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const { getUndoState: getUndoStateFn, clearUndoData: clearUndoDataFn } = undoServices


// undo / redo themselves: undoStepHistory.test.ts.

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
            undoTexts: ['add obj', 'color', 'rename'],
            redoTexts: ['delete'],
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
            undoTexts: [],
            redoTexts: [],
        })
    })

    it('returns the empty state when the scene is missing', () => {
        const { ctx } = makeUndoStateCtx({ sceneNull: true })
        expect(getUndoStateFn(ctx, { sceneId: 99 })).toEqual({
            canUndo: false,
            canRedo: false,
            undoDescs: [],
            redoDescs: [],
            undoTexts: [],
            redoTexts: [],
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
