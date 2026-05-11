import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '../worker/server/services/rendererColoring.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

interface FixtureOpts {
    /** Coloring class name returned by rend.coloring.getClassName(). */
    coloringClass?: string
    /** When true, mol.sel.isEmpty() returns true. */
    selIsEmpty?: boolean
    /** When true, mol.sel is null (no selection at all). */
    selIsNull?: boolean
    /** When true, scene lookup returns null. */
    sceneExists?: boolean
    /** When true, scene.getRenderer returns the renderer; else null. */
    rendExists?: boolean
    /** When true, rend.getClientObj() returns null (no parent mol). */
    molExists?: boolean
}

function makeFixture(opts: FixtureOpts = {}) {
    const {
        coloringClass = 'PaintColoring',
        selIsEmpty = false,
        selIsNull = false,
        sceneExists = true,
        rendExists = true,
        molExists = true,
    } = opts

    const insertBefore = vi.fn()
    const coloring = {
        getClassName: () => coloringClass,
        insertBefore,
    }

    const isEmpty = vi.fn(() => selIsEmpty)
    const sel = selIsNull ? null : { isEmpty }
    const mol = molExists ? { sel } : null

    const rend = {
        coloring,
        getClientObj: vi.fn(() => mol),
    }

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const scene = {
        uid: 7,
        getRenderer: vi.fn(() => (rendExists ? rend : null)),
        startUndoTxn,
        commitUndoTxn,
        rollbackUndoTxn,
    }

    const compileColor = vi.fn((str: string, _uid: number) => ({ __color: str }))

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
        styleMgr: { compileColor },
    } as unknown as WorkerContext

    return {
        ctx, rend, coloring, sel, mol, scene, insertBefore, compileColor,
        startUndoTxn, commitUndoTxn, rollbackUndoTxn, isEmpty,
    }
}

describe('paintRendererSelection', () => {
    beforeEach(() => vi.clearAllMocks())

    it('inserts a paint entry under "Insert paint entry" undo txn', () => {
        const { ctx, insertBefore, sel, compileColor, startUndoTxn, commitUndoTxn } =
            makeFixture()
        const res = services.paintRendererSelection(ctx, {
            sceneId: 1,
            rendId: 100,
            colorValue: 'hsb(0, 1.0, 1.0)',
        })
        expect(res).toEqual({ ok: true })
        expect(compileColor).toHaveBeenCalledWith('hsb(0, 1.0, 1.0)', 7)
        expect(insertBefore).toHaveBeenCalledWith(0, sel, { __color: 'hsb(0, 1.0, 1.0)' })
        expect(startUndoTxn).toHaveBeenCalledWith('Insert paint entry')
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('returns ok:false when coloring is not PaintColoring', () => {
        const { ctx, insertBefore, startUndoTxn } = makeFixture({
            coloringClass: 'CPKColoring',
        })
        const res = services.paintRendererSelection(ctx, {
            sceneId: 1, rendId: 100, colorValue: '#FFF',
        })
        expect(res).toEqual({ ok: false })
        expect(insertBefore).not.toHaveBeenCalled()
        expect(startUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok:false when sel is empty', () => {
        const { ctx, insertBefore } = makeFixture({ selIsEmpty: true })
        const res = services.paintRendererSelection(ctx, {
            sceneId: 1, rendId: 100, colorValue: '#FFF',
        })
        expect(res).toEqual({ ok: false })
        expect(insertBefore).not.toHaveBeenCalled()
    })

    it('returns ok:false when mol.sel is null', () => {
        const { ctx, insertBefore } = makeFixture({ selIsNull: true })
        const res = services.paintRendererSelection(ctx, {
            sceneId: 1, rendId: 100, colorValue: '#FFF',
        })
        expect(res).toEqual({ ok: false })
        expect(insertBefore).not.toHaveBeenCalled()
    })

    it('returns ok:false when parent mol cannot be resolved', () => {
        const { ctx, insertBefore } = makeFixture({ molExists: false })
        const res = services.paintRendererSelection(ctx, {
            sceneId: 1, rendId: 100, colorValue: '#FFF',
        })
        expect(res).toEqual({ ok: false })
        expect(insertBefore).not.toHaveBeenCalled()
    })

    it('returns ok:false when scene / renderer lookup fails', () => {
        const a = makeFixture({ sceneExists: false })
        expect(services.paintRendererSelection(a.ctx, {
            sceneId: 1, rendId: 100, colorValue: '#FFF',
        })).toEqual({ ok: false })

        const b = makeFixture({ rendExists: false })
        expect(services.paintRendererSelection(b.ctx, {
            sceneId: 1, rendId: 100, colorValue: '#FFF',
        })).toEqual({ ok: false })
    })
})

describe('getRendererPaintInfo', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns canPaint:true when coloring is PaintColoring and sel is non-empty', () => {
        const { ctx } = makeFixture({ coloringClass: 'PaintColoring', selIsEmpty: false })
        expect(services.getRendererPaintInfo(ctx, { sceneId: 1, rendId: 100 }))
            .toEqual({ canPaint: true })
    })

    it('returns canPaint:false when coloring is not PaintColoring', () => {
        const { ctx } = makeFixture({ coloringClass: 'CPKColoring' })
        expect(services.getRendererPaintInfo(ctx, { sceneId: 1, rendId: 100 }))
            .toEqual({ canPaint: false })
    })

    it('returns canPaint:false when sel is empty', () => {
        const { ctx } = makeFixture({ selIsEmpty: true })
        expect(services.getRendererPaintInfo(ctx, { sceneId: 1, rendId: 100 }))
            .toEqual({ canPaint: false })
    })

    it('returns canPaint:false when scene / renderer / mol lookup fails', () => {
        for (const o of [
            { sceneExists: false },
            { rendExists: false },
            { molExists: false },
            { selIsNull: true },
        ] as const) {
            const { ctx } = makeFixture(o)
            expect(services.getRendererPaintInfo(ctx, { sceneId: 1, rendId: 100 }))
                .toEqual({ canPaint: false })
        }
    })
})
