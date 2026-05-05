import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/services/sceneBgColor.service'
import type { WorkerContext } from '../worker/types/WorkerContext'

function makeCtx(r = 0, g = 0, b = 0) {
    const mockColor = { r: vi.fn(() => r), g: vi.fn(() => g), b: vi.fn(() => b) }
    const mockScene = {
        bgcolor: mockColor,
        uid: 1,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
    }
    const mockCompileColor = vi.fn((str: string) => ({ _colorStr: str }))
    const getScene = vi.fn(() => mockScene)
    const ctx = {
        sceMgr: { getScene },
        styleMgr: { compileColor: mockCompileColor },
    } as unknown as WorkerContext
    return { ctx, mockScene, mockColor, mockCompileColor, getScene }
}

describe('sceneBgColor service', () => {
    describe('getSceneBgColor', () => {
        it('returns black when RGB is (0, 0, 0)', () => {
            const { ctx, getScene } = makeCtx(0, 0, 0)
            expect(services.getSceneBgColor(ctx, { sceneId: 10 })).toEqual({ ok: true, bgColor: 'black' })
            expect(getScene).toHaveBeenCalledWith(10)
        })

        it('returns white when RGB is (255, 255, 255)', () => {
            const { ctx } = makeCtx(255, 255, 255)
            expect(services.getSceneBgColor(ctx, { sceneId: 10 })).toEqual({ ok: true, bgColor: 'white' })
        })

        it('returns other for non-white non-black colors', () => {
            const { ctx } = makeCtx(128, 64, 32)
            expect(services.getSceneBgColor(ctx, { sceneId: 10 })).toEqual({ ok: true, bgColor: 'other' })
        })
    })

    describe('setSceneBgColor', () => {
        it('sets white background using compileColor and undo transaction', () => {
            const { ctx, mockScene, mockCompileColor } = makeCtx(0, 0, 0)
            const result = services.setSceneBgColor(ctx, { sceneId: 10, colorName: 'white' })
            expect(result).toEqual({ ok: true, bgColor: 'white' })
            expect(mockCompileColor).toHaveBeenCalledWith('white', 1)
            expect(mockScene.startUndoTxn).toHaveBeenCalledWith('Set background color')
            expect(mockScene.commitUndoTxn).toHaveBeenCalled()
        })

        it('sets black background using compileColor and undo transaction', () => {
            const { ctx, mockScene, mockCompileColor } = makeCtx(255, 255, 255)
            const result = services.setSceneBgColor(ctx, { sceneId: 10, colorName: 'black' })
            expect(result).toEqual({ ok: true, bgColor: 'black' })
            expect(mockCompileColor).toHaveBeenCalledWith('black', 1)
            expect(mockScene.startUndoTxn).toHaveBeenCalledWith('Set background color')
            expect(mockScene.commitUndoTxn).toHaveBeenCalled()
        })

        it('rolls back undo transaction on error', () => {
            const { ctx, mockScene } = makeCtx(0, 0, 0)
            mockScene.startUndoTxn.mockImplementation(() => {})
            // Make bgcolor setter throw
            Object.defineProperty(mockScene, 'bgcolor', {
                get: () => ({ r: vi.fn(() => 0), g: vi.fn(() => 0), b: vi.fn(() => 0) }),
                set: () => { throw new Error('assign failed') },
            })
            expect(() => services.setSceneBgColor(ctx, { sceneId: 10, colorName: 'white' })).toThrow('assign failed')
            expect(mockScene.rollbackUndoTxn).toHaveBeenCalled()
            expect(mockScene.commitUndoTxn).not.toHaveBeenCalled()
        })
    })
})
