/**
 * Pin the contracts of `applyMolSelString.service`:
 *
 *   - applyMolSelString -> assigns mol.sel under "Change mol selection"
 *     undo txn, auto-creates the *selection renderer.
 *   - selectAndFocusMol -> applies sel, then frames the view on it, in
 *     one txn recorded as set_mol_selection then focus_selection.
 *   - focusMolSelection with no selection given uses the object's current
 *     one and never writes mol.sel; an empty one is refused, not taken as
 *     every atom.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))
vi.mock('@renderer/worker/server/actions/serviceOps', () => ({ recordOp: vi.fn() }))

import { services } from '@renderer/worker/server/services/select/select.service'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'
import { recordOp } from '@renderer/worker/server/actions/serviceOps'

const { applyMolSelString, selectAndFocusMol, focusMolSelection } = services

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

/** A MolCoord whose selection reads back what was written to it. */
function framingMol(current: string) {
    let sel: unknown = { toString: () => current }
    const setSel = vi.fn((v: unknown) => { sel = v })
    const fitView2 = vi.fn()
    const mol = {
        get sel() { return sel },
        set sel(v: unknown) { setSel(v) },
        getAtomSelSize: vi.fn(() => 5),
        fitView2,
        getRendererByType: vi.fn(() => ({})),
        createRenderer: vi.fn(),
    }
    const view = {}
    const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
    const ctx = makeCtx({ scene, view: view as never })
    return { ctx, mol, setSel, fitView2, view, scene }
}

describe('selectAndFocusMol', () => {
    beforeEach(() => vi.clearAllMocks())

    it('sets the selection, fits the view to it, and records both ops on one step', () => {
        const { ctx, setSel, fitView2, view, scene } = framingMol('')
        const res = selectAndFocusMol(ctx, { sceneId: 100, viewId: 7, molId: 11, selStr: 'resid 1:5', zoom: true })
        expect(res).toEqual({ ok: true })
        expect(setSel).toHaveBeenCalledWith({ __sel: true })
        // Framed on the selection just set, not compiled again.
        expect(fitView2).toHaveBeenCalledWith(view, { __sel: true })
        expect(scene.startUndoTxn).toHaveBeenCalledTimes(1)
        expect(vi.mocked(recordOp).mock.calls.map((c) => [c[2], c[3]])).toEqual([
            ['set_mol_selection', { objId: 11, selection: 'resid 1:5' }],
            ['focus_selection', { objId: 11, selection: null, zoom: true }],
        ])
    })
})

describe('focusMolSelection', () => {
    beforeEach(() => vi.clearAllMocks())

    it('frames the current selection without writing it, and refuses an empty one', () => {
        const { ctx, mol, setSel, fitView2, view } = framingMol('resid 1:5')
        const current = mol.sel
        expect(focusMolSelection(ctx, { sceneId: 100, viewId: 7, molId: 11, selStr: null, zoom: true }).ok).toBe(true)
        expect(fitView2).toHaveBeenCalledWith(view, current)
        expect(setSel).not.toHaveBeenCalled()

        // C++ iterates an empty selection as every atom: that must not
        // become a fit to the whole molecule.
        const empty = framingMol('')
        const res = focusMolSelection(empty.ctx, { sceneId: 100, viewId: 7, molId: 11, selStr: null, zoom: true })
        expect(res.ok).toBe(false)
        expect(empty.fitView2).not.toHaveBeenCalled()
    })
})
