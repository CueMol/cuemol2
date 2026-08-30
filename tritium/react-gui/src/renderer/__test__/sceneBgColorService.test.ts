import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/sceneBgColor.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

interface MakeCtxOpts {
    r?: number
    g?: number
    b?: number
    use_colproof?: boolean
    icc_filename?: string
    /** When true, ctx.sceMgr.getScene returns null. */
    sceneMissing?: boolean
}

function makeCtx(opts: MakeCtxOpts | number = {}, g = 0, b = 0) {
    // Back-compat with positional (r, g, b) signature used by existing tests.
    const o: MakeCtxOpts =
        typeof opts === 'number' ? { r: opts, g, b } : opts
    const {
        r = 0, g: gg = 0, b: bb = 0,
        use_colproof = false,
        icc_filename = '',
        sceneMissing = false,
    } = o
    const mockColor = { r: vi.fn(() => r), g: vi.fn(() => gg), b: vi.fn(() => bb) }
    const mockScene = {
        bgcolor: mockColor,
        uid: 1,
        use_colproof,
        icc_filename,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
    }
    const mockCompileColor = vi.fn((str: string) => ({ _colorStr: str }))
    const getScene = vi.fn(() => (sceneMissing ? null : mockScene))
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

    describe('getSceneColorProofing', () => {
        it('returns enabled:true only when both use_colproof and icc_filename are set', () => {
            const { ctx } = makeCtx({ use_colproof: true, icc_filename: 'sRGB.icm' })
            expect(services.getSceneColorProofing(ctx, { sceneId: 10 }))
                .toEqual({ ok: true, enabled: true })
        })

        it('returns enabled:false when use_colproof is false', () => {
            const { ctx } = makeCtx({ use_colproof: false, icc_filename: 'sRGB.icm' })
            expect(services.getSceneColorProofing(ctx, { sceneId: 10 }))
                .toEqual({ ok: true, enabled: false })
        })

        it('returns enabled:false when icc_filename is empty even if use_colproof is true', () => {
            const { ctx } = makeCtx({ use_colproof: true, icc_filename: '' })
            expect(services.getSceneColorProofing(ctx, { sceneId: 10 }))
                .toEqual({ ok: true, enabled: false })
        })

        it('returns ok:false when scene lookup fails', () => {
            const { ctx } = makeCtx({ sceneMissing: true })
            expect(services.getSceneColorProofing(ctx, { sceneId: 10 }))
                .toEqual({ ok: false, enabled: false })
        })
    })

    describe('toggleSceneColorProofing', () => {
        it('turn-on: sets use_colproof=true and assigns default ICC profile when empty', () => {
            const { ctx, mockScene } = makeCtx({ use_colproof: false, icc_filename: '' })
            const res = services.toggleSceneColorProofing(ctx, { sceneId: 10 })
            expect(mockScene.use_colproof).toBe(true)
            expect(mockScene.icc_filename).toBe('GenericCMYK.icm')
            expect(mockScene.startUndoTxn).toHaveBeenCalledWith('Toggle color proofing')
            expect(mockScene.commitUndoTxn).toHaveBeenCalled()
            expect(res).toEqual({ ok: true, enabled: true })
        })

        it('turn-on: preserves a previously configured ICC profile', () => {
            const { ctx, mockScene } = makeCtx({ use_colproof: false, icc_filename: 'Custom.icm' })
            services.toggleSceneColorProofing(ctx, { sceneId: 10 })
            expect(mockScene.use_colproof).toBe(true)
            expect(mockScene.icc_filename).toBe('Custom.icm')
        })

        it('turn-off: only flips use_colproof; icc_filename retained for next turn-on', () => {
            const { ctx, mockScene } = makeCtx({ use_colproof: true, icc_filename: 'sRGB.icm' })
            const res = services.toggleSceneColorProofing(ctx, { sceneId: 10 })
            expect(mockScene.use_colproof).toBe(false)
            expect(mockScene.icc_filename).toBe('sRGB.icm')
            expect(res).toEqual({ ok: true, enabled: false })
        })

        it('returns ok:false when scene lookup fails', () => {
            const { ctx } = makeCtx({ sceneMissing: true })
            expect(services.toggleSceneColorProofing(ctx, { sceneId: 10 }))
                .toEqual({ ok: false, enabled: false })
        })
    })
})
