/**
 * Pin Phase 1 + Phase 2 contracts of `applyMolSelString.service`:
 *
 *   - applyMolSelString -> assigns mol.sel under "Change mol selection"
 *     undo txn, auto-creates the *selection renderer.
 *   - centerMolSelection -> applies sel, then view.setViewCenter(
 *     mol.getCenterPos(true)). Skips silently if getCenterPos throws.
 *   - zoomMolSelection -> applies sel, then mol.fitView(view, true).
 *     Duck-types fitView so missing-method cases fail soft.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

vi.mock('../worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))

import { services } from '../worker/server/services/applyMolSelString.service'
import { makeSel } from '../worker/server/services/helpers/makeSel'

const { applyMolSelString, centerMolSelection, zoomMolSelection } = services

function makeMol(opts: {
    hasSelRend?: boolean
    hasFitView?: boolean
    centerThrows?: boolean
    fitViewThrows?: boolean
} = {}) {
    const setSel = vi.fn()
    const createRenderer = vi.fn()
    const getRendererByType = vi.fn((type: string) => {
        if (type === '*selection') return opts.hasSelRend ? {} : null
        return null
    })
    const getCenterPos = vi.fn(() => {
        if (opts.centerThrows) throw new Error('no atoms')
        return { __pos: true }
    })
    const fitView = vi.fn((_view: unknown, _bSelOnly: boolean) => {
        if (opts.fitViewThrows) throw new Error('cannot fit')
    })
    const mol: Record<string, unknown> = {
        get sel() { return undefined },
        set sel(v: unknown) { setSel(v) },
        createRenderer,
        getRendererByType,
        getCenterPos,
    }
    if (opts.hasFitView !== false) mol.fitView = fitView
    return { mol, setSel, createRenderer, getRendererByType, getCenterPos, fitView }
}

function makeUndoScene(uid: number) {
    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()
    return { startUndoTxn, commitUndoTxn, rollbackUndoTxn, uid }
}

function makeCtx(opts: {
    scene?: Record<string, unknown> | null
    view?: { setViewCenter: ReturnType<typeof vi.fn> } | null
    sceneById?: number
} = {}) {
    const sid = opts.sceneById ?? 100
    return {
        sceMgr: {
            getScene: vi.fn((id: number) => (id === sid ? opts.scene ?? null : null)),
            getView: vi.fn(() => opts.view ?? null),
        },
    } as unknown as WorkerContext
}

describe('applyMolSelString', () => {
    beforeEach(() => vi.clearAllMocks())

    it('assigns mol.sel inside an undo txn labelled "Change mol selection"', () => {
        const { mol, setSel } = makeMol({ hasSelRend: true })
        const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
        const ctx = makeCtx({ scene })
        const result = applyMolSelString(ctx, { sceneId: 100, molId: 11, selStr: 'protein' })
        expect(result).toEqual({ ok: true })
        expect(makeSel).toHaveBeenCalledWith(ctx, 'protein', 100)
        expect(setSel).toHaveBeenCalledWith({ __sel: true })
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Change mol selection')
        expect(scene.commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('auto-creates the *selection renderer when missing', () => {
        const { mol, createRenderer } = makeMol({ hasSelRend: false })
        const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
        const ctx = makeCtx({ scene })
        applyMolSelString(ctx, { sceneId: 100, molId: 11, selStr: 'protein' })
        expect(createRenderer).toHaveBeenCalledWith('*selection')
    })

    it('returns ok:false when makeSel fails to compile', () => {
        ;(makeSel as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
        const { mol, setSel } = makeMol({ hasSelRend: true })
        const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
        const ctx = makeCtx({ scene })
        expect(
            applyMolSelString(ctx, { sceneId: 100, molId: 11, selStr: 'bad(syntax' }),
        ).toEqual({ ok: false })
        expect(setSel).not.toHaveBeenCalled()
    })

    it('returns ok:false when the scene lookup misses', () => {
        const ctx = makeCtx({ scene: null })
        expect(
            applyMolSelString(ctx, { sceneId: 100, molId: 11, selStr: 'protein' }),
        ).toEqual({ ok: false })
    })
})

describe('centerMolSelection', () => {
    beforeEach(() => vi.clearAllMocks())

    function setup(opts: { centerThrows?: boolean } = {}) {
        const { mol, setSel, getCenterPos } = makeMol({
            hasSelRend: true,
            centerThrows: opts.centerThrows,
        })
        const setViewCenter = vi.fn()
        const view = { setViewCenter, getScene: () => scene }
        const scene = {
            ...makeUndoScene(100),
            getObject: vi.fn(() => mol),
        }
        const ctx = {
            sceMgr: {
                getView: vi.fn(() => view),
                getScene: vi.fn(() => scene),
            },
        } as unknown as WorkerContext
        return { ctx, mol, setSel, setViewCenter, getCenterPos, scene }
    }

    it('applies sel then setViewCenter(getCenterPos(true)) under undo txn', () => {
        const { ctx, setSel, setViewCenter, getCenterPos, scene } = setup()
        const result = centerMolSelection(ctx, {
            sceneId: 100, viewId: 7, molId: 11, selStr: 'protein',
        })
        expect(result).toEqual({ ok: true })
        expect(setSel).toHaveBeenCalledWith({ __sel: true })
        expect(getCenterPos).toHaveBeenCalledWith(true)
        expect(setViewCenter).toHaveBeenCalledWith({ __pos: true })
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Center on mol selection')
    })

    it('skips setViewCenter and reports ok:false when getCenterPos throws', () => {
        const { ctx, setViewCenter } = setup({ centerThrows: true })
        const result = centerMolSelection(ctx, {
            sceneId: 100, viewId: 7, molId: 11, selStr: 'protein',
        })
        expect(result).toEqual({ ok: false })
        expect(setViewCenter).not.toHaveBeenCalled()
    })

    it('returns ok:false when the view lookup misses', () => {
        const ctx = {
            sceMgr: {
                getView: vi.fn(() => null),
                getScene: vi.fn(() => null),
            },
        } as unknown as WorkerContext
        expect(
            centerMolSelection(ctx, { sceneId: 100, viewId: 7, molId: 11, selStr: 'protein' }),
        ).toEqual({ ok: false })
    })

    it('rejects when sceneId does not match the view\'s scene (cross-scene guard)', () => {
        const { ctx, setViewCenter } = setup()
        // setup makes scene.uid == 100; ask for sceneId 999.
        const result = centerMolSelection(ctx, {
            sceneId: 999, viewId: 7, molId: 11, selStr: 'protein',
        })
        expect(result).toEqual({ ok: false })
        expect(setViewCenter).not.toHaveBeenCalled()
    })
})

describe('zoomMolSelection', () => {
    beforeEach(() => vi.clearAllMocks())

    function setup(opts: { hasFitView?: boolean; fitViewThrows?: boolean } = {}) {
        const { mol, setSel, fitView } = makeMol({
            hasSelRend: true,
            hasFitView: opts.hasFitView,
            fitViewThrows: opts.fitViewThrows,
        })
        const setViewCenter = vi.fn()
        const view = { setViewCenter, getScene: () => scene }
        const scene = {
            ...makeUndoScene(100),
            getObject: vi.fn(() => mol),
        }
        const ctx = {
            sceMgr: {
                getView: vi.fn(() => view),
                getScene: vi.fn(() => scene),
            },
        } as unknown as WorkerContext
        return { ctx, mol, setSel, fitView, scene }
    }

    it('applies sel then mol.fitView(view, true) under undo txn', () => {
        const { ctx, setSel, fitView, scene } = setup()
        const result = zoomMolSelection(ctx, {
            sceneId: 100, viewId: 7, molId: 11, selStr: 'protein',
        })
        expect(result).toEqual({ ok: true })
        expect(setSel).toHaveBeenCalledWith({ __sel: true })
        expect(fitView).toHaveBeenCalledTimes(1)
        // fitView(view, true) — second arg is bSelOnly
        expect(fitView.mock.calls[0][1]).toBe(true)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Zoom to mol selection')
    })

    it('returns ok:false when fitView is not exposed on this mol subclass', () => {
        const { ctx } = setup({ hasFitView: false })
        const result = zoomMolSelection(ctx, {
            sceneId: 100, viewId: 7, molId: 11, selStr: 'protein',
        })
        expect(result).toEqual({ ok: false })
    })

    it('returns ok:false when fitView throws', () => {
        const { ctx } = setup({ fitViewThrows: true })
        const result = zoomMolSelection(ctx, {
            sceneId: 100, viewId: 7, molId: 11, selStr: 'protein',
        })
        expect(result).toEqual({ ok: false })
    })
})
