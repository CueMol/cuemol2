/**
 * Pin the contracts of `seqPanelOps.service`:
 *
 *   - toggleResidueSelection -> ResidRangeSet.fromSel(mol.sel) ->
 *     contains(residue) ? remove(addSel) : append(addSel) ->
 *     mol.sel = rrs.toSel(mol). Auto-creates *selection renderer.
 *     Wrapped under "Toggle select atom(s)" undo txn.
 *   - rangeSelectResidues -> same pattern; `'<chain>'.<to>:<from>.*`
 *     selstr; toggle=true && contains(fromResidue) -> remove, else
 *     append.
 *   - centerOnResidue -> view.setViewCenter(residue.getPivotPos()).
 *     No undo txn (pure view op).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn((_ctx: unknown, str: string) => ({ __sel: str })),
}))

import { services } from '@renderer/worker/server/services/seqPanelOps.service'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'

const { toggleResidueSelection, rangeSelectResidues, centerOnResidue } = services

function makeUndoScene(uid: number) {
    return {
        uid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
    }
}

function makeRrs(opts: { contains?: boolean } = {}) {
    return {
        fromSel: vi.fn(),
        contains: vi.fn(() => opts.contains ?? false),
        append: vi.fn(),
        remove: vi.fn(),
        toSel: vi.fn(() => ({ __toSel: true })),
    }
}

function makeMol(opts: { hasSelRend?: boolean; residue?: object | null } = {}) {
    const setSel = vi.fn()
    const createRenderer = vi.fn()
    const getRendererByType = vi.fn((type: string) =>
        type === '*selection' && opts.hasSelRend ? {} : null,
    )
    const residue = opts.residue === undefined ? { __res: true } : opts.residue
    const getResidue = vi.fn(() => residue)
    return {
        mol: {
            get sel() { return undefined },
            set sel(v: unknown) { setSel(v) },
            getRendererByType,
            createRenderer,
            getResidue,
        },
        setSel,
        createRenderer,
        getRendererByType,
        getResidue,
        residue,
    }
}

describe('toggleResidueSelection', () => {
    let rrs: ReturnType<typeof makeRrs>
    beforeEach(() => {
        vi.clearAllMocks()
        rrs = makeRrs()
    })

    function buildCtx(opts: {
        scene?: Record<string, unknown> | null
        contains?: boolean
    } = {}) {
        rrs = makeRrs({ contains: opts.contains })
        return {
            sceMgr: { getScene: vi.fn(() => opts.scene ?? null) },
            svc: { createObj: vi.fn(() => rrs) },
        } as unknown as WorkerContext
    }

    it('appends the residue to mol.sel when not currently contained', () => {
        const { mol, setSel, createRenderer } = makeMol({ hasSelRend: false })
        const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
        const ctx = buildCtx({ scene, contains: false })

        const result = toggleResidueSelection(ctx, {
            sceneId: 100, molId: 11, chainName: 'A', residueIndex: '10',
        })

        expect(result).toEqual({ ok: true })
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Toggle select atom(s)')
        expect(createRenderer).toHaveBeenCalledWith('*selection')
        expect(rrs.fromSel).toHaveBeenCalled()
        expect(makeSel).toHaveBeenCalledWith(ctx, "'A'.10.*", 100)
        expect(rrs.append).toHaveBeenCalledWith(mol, { __sel: "'A'.10.*" })
        expect(rrs.remove).not.toHaveBeenCalled()
        expect(setSel).toHaveBeenCalledWith({ __toSel: true })
        expect(scene.commitUndoTxn).toHaveBeenCalled()
    })

    it('removes the residue from mol.sel when already contained', () => {
        const { mol, setSel } = makeMol({ hasSelRend: true })
        const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
        const ctx = buildCtx({ scene, contains: true })

        const result = toggleResidueSelection(ctx, {
            sceneId: 100, molId: 11, chainName: 'B', residueIndex: '42A',
        })

        expect(result).toEqual({ ok: true })
        expect(makeSel).toHaveBeenCalledWith(ctx, "'B'.42A.*", 100)
        expect(rrs.remove).toHaveBeenCalledWith(mol, { __sel: "'B'.42A.*" })
        expect(rrs.append).not.toHaveBeenCalled()
        expect(setSel).toHaveBeenCalledWith({ __toSel: true })
    })

    it('skips auto-create when *selection renderer already exists', () => {
        const { mol, createRenderer } = makeMol({ hasSelRend: true })
        const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
        const ctx = buildCtx({ scene })
        toggleResidueSelection(ctx, {
            sceneId: 100, molId: 11, chainName: 'A', residueIndex: '1',
        })
        expect(createRenderer).not.toHaveBeenCalled()
    })

    it('returns ok:false when the residue cannot be resolved', () => {
        const { mol, setSel } = makeMol({ residue: null })
        const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
        const ctx = buildCtx({ scene })
        const result = toggleResidueSelection(ctx, {
            sceneId: 100, molId: 11, chainName: 'A', residueIndex: '999',
        })
        expect(result).toEqual({ ok: false })
        expect(setSel).not.toHaveBeenCalled()
    })

    it('returns ok:false when makeSel fails to compile', () => {
        ;(makeSel as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
        const { mol, setSel } = makeMol({ hasSelRend: true })
        const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
        const ctx = buildCtx({ scene })
        const result = toggleResidueSelection(ctx, {
            sceneId: 100, molId: 11, chainName: 'A', residueIndex: '1',
        })
        expect(result).toEqual({ ok: false })
        expect(setSel).not.toHaveBeenCalled()
    })

    it('returns ok:false when scene lookup misses', () => {
        const ctx = buildCtx({ scene: null })
        expect(
            toggleResidueSelection(ctx, {
                sceneId: 100, molId: 11, chainName: 'A', residueIndex: '1',
            }),
        ).toEqual({ ok: false })
    })
})

describe('rangeSelectResidues', () => {
    let rrs: ReturnType<typeof makeRrs>
    beforeEach(() => {
        vi.clearAllMocks()
        rrs = makeRrs()
    })

    function buildCtx(opts: {
        scene?: Record<string, unknown> | null
        contains?: boolean
    } = {}) {
        rrs = makeRrs({ contains: opts.contains })
        return {
            sceMgr: { getScene: vi.fn(() => opts.scene ?? null) },
            svc: { createObj: vi.fn(() => rrs) },
        } as unknown as WorkerContext
    }

    it('appends a range selection by default', () => {
        const { mol, setSel } = makeMol({ hasSelRend: true })
        const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
        const ctx = buildCtx({ scene })

        const result = rangeSelectResidues(ctx, {
            sceneId: 100, molId: 11, chainName: 'A',
            fromIndex: '10', toIndex: '20', toggle: false,
        })

        expect(result).toEqual({ ok: true })
        expect(makeSel).toHaveBeenCalledWith(ctx, "'A'.20:10.*", 100)
        expect(rrs.append).toHaveBeenCalledWith(mol, { __sel: "'A'.20:10.*" })
        expect(rrs.remove).not.toHaveBeenCalled()
        expect(setSel).toHaveBeenCalledWith({ __toSel: true })
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Toggle select atom(s)')
    })

    it('removes the range when toggle=true and fromResidue already contained', () => {
        const { mol, setSel } = makeMol({ hasSelRend: true })
        const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
        const ctx = buildCtx({ scene, contains: true })

        rangeSelectResidues(ctx, {
            sceneId: 100, molId: 11, chainName: 'C',
            fromIndex: '5', toIndex: '8', toggle: true,
        })

        expect(rrs.remove).toHaveBeenCalledWith(mol, { __sel: "'C'.8:5.*" })
        expect(rrs.append).not.toHaveBeenCalled()
        expect(setSel).toHaveBeenCalledWith({ __toSel: true })
    })

    it('returns ok:false when from-residue cannot be resolved', () => {
        const { mol } = makeMol({ residue: null })
        const scene = { ...makeUndoScene(100), getObject: vi.fn(() => mol) }
        const ctx = buildCtx({ scene })
        const result = rangeSelectResidues(ctx, {
            sceneId: 100, molId: 11, chainName: 'A',
            fromIndex: '999', toIndex: '1', toggle: false,
        })
        expect(result).toEqual({ ok: false })
    })
})

describe('centerOnResidue', () => {
    beforeEach(() => vi.clearAllMocks())

    function setup(opts: {
        sceneUid?: number
        residue?: { getPivotPos: () => unknown } | null
    } = {}) {
        const uid = opts.sceneUid ?? 100
        const residue = opts.residue === undefined
            ? { getPivotPos: vi.fn(() => ({ __pos: true })) }
            : opts.residue
        const mol = {
            getResidue: vi.fn(() => residue),
        }
        const setViewCenter = vi.fn()
        const scene = { uid, getObject: vi.fn(() => mol) }
        const view = { setViewCenter, getScene: () => scene }
        const ctx = {
            sceMgr: {
                getView: vi.fn(() => view),
                getScene: vi.fn(() => scene),
            },
        } as unknown as WorkerContext
        return { ctx, mol, residue, setViewCenter, scene }
    }

    it('sets the view center to residue.getPivotPos()', () => {
        const { ctx, setViewCenter } = setup()
        const result = centerOnResidue(ctx, {
            sceneId: 100, viewId: 7, molId: 11, chainName: 'A', residueIndex: '15',
        })
        expect(result).toEqual({ ok: true })
        expect(setViewCenter).toHaveBeenCalledWith({ __pos: true })
    })

    it('returns ok:false when residue lookup misses', () => {
        const { ctx, setViewCenter } = setup({ residue: null })
        const result = centerOnResidue(ctx, {
            sceneId: 100, viewId: 7, molId: 11, chainName: 'A', residueIndex: '99',
        })
        expect(result).toEqual({ ok: false })
        expect(setViewCenter).not.toHaveBeenCalled()
    })

    it('returns ok:false when getPivotPos throws', () => {
        const { ctx, setViewCenter } = setup({
            residue: { getPivotPos: vi.fn(() => { throw new Error('no pos') }) },
        })
        const result = centerOnResidue(ctx, {
            sceneId: 100, viewId: 7, molId: 11, chainName: 'A', residueIndex: '1',
        })
        expect(result).toEqual({ ok: false })
        expect(setViewCenter).not.toHaveBeenCalled()
    })

    it('rejects cross-scene viewId/sceneId mismatch', () => {
        const { ctx, setViewCenter } = setup({ sceneUid: 100 })
        const result = centerOnResidue(ctx, {
            sceneId: 999, viewId: 7, molId: 11, chainName: 'A', residueIndex: '1',
        })
        expect(result).toEqual({ ok: false })
        expect(setViewCenter).not.toHaveBeenCalled()
    })
})
