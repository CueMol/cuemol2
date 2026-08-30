/**
 * Pin contracts for `symmetryPanelOps.service`:
 *   - getSymmetryPanelInfo: returns hasInfo=false when getExtData yields
 *     null; cellOk=false when any of a/b/c < 0.1; classifies MolCoord-
 *     like classes (MolCoord, *Mol suffix) vs DensityMap.
 *   - changeSymmetryInfo: calls SymmOpManager.changeXtalInfo with the
 *     exact (objId, a, b, c, alpha, beta, gamma, nsg) tuple inside a
 *     "Change symminfo" undo txn.
 *   - showUnitCellRenderer: short-circuits when *unitcell renderer
 *     already exists; otherwise creates one inside an undo txn.
 *   - showSymmRenderer: sets unitcell=true / autoupdate=false for
 *     extent='unitcell'; sets extent / unitcell=false / autoupdate=true
 *     / center for finite extent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

import { services } from '@renderer/worker/server/services/molops/molops.service'

const {
    getSymmetryPanelInfo,
    changeSymmetryInfo,
    showUnitCellRenderer,
    showSymmRenderer,
} = services

function makeUndoScene(uid: number) {
    return {
        uid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn(),
        getSceneDataJSON: vi.fn(),
    }
}

function makeCtx(opts: {
    scene?: ReturnType<typeof makeUndoScene> | null
    view?: Record<string, unknown> | null
    sceneId?: number
    viewId?: number
    symmMgr?: unknown
}) {
    const sid = opts.sceneId ?? 100
    const vid = opts.viewId ?? 1
    return {
        sceMgr: {
            getScene: vi.fn((id: number) => (id === sid ? opts.scene ?? null : null)),
            getView: vi.fn((id: number) => (id === vid ? opts.view ?? null : null)),
        },
        svc: {
            getService: vi.fn((name: string) =>
                name === 'SymmOpManager' ? opts.symmMgr ?? null : null,
            ),
        },
    } as unknown as WorkerContext
}

function makeObjWithCrystalInfo(opts: {
    className?: string
    info?: {
        lattice: string
        hm_spacegroup: string
        a: number; b: number; c: number
        alpha: number; beta: number; gamma: number
        nsg: number
    } | null
} = {}) {
    const className = opts.className ?? 'MolCoord'
    const xi = opts.info
    return {
        getExtData: vi.fn((name: string) => (name === 'CrystalInfo' ? xi ?? null : null)),
        getClassName: vi.fn(() => className),
    }
}

describe('getSymmetryPanelInfo', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns empty result when scene missing', () => {
        const ctx = makeCtx({ scene: null })
        const res = getSymmetryPanelInfo(ctx, { sceneId: 100, objId: 1 })
        expect(res).toEqual({
            info: null, objectExists: false, hasInfo: false, isMol: false, cellOk: false,
        })
    })

    it('returns hasInfo=false when object has no CrystalInfo', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => makeObjWithCrystalInfo({ info: null }))
        const ctx = makeCtx({ scene })
        const res = getSymmetryPanelInfo(ctx, { sceneId: 100, objId: 1 })
        expect(res.hasInfo).toBe(false)
        expect(res.objectExists).toBe(true)
        expect(res.isMol).toBe(true) // MolCoord
        expect(res.cellOk).toBe(false)
    })

    it('returns hasInfo=true + cellOk=true for a healthy MolCoord', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => makeObjWithCrystalInfo({
            info: {
                lattice: 'HEXAGONAL', hm_spacegroup: 'P 61',
                a: 72.03, b: 72.03, c: 194.35,
                alpha: 90, beta: 90, gamma: 120,
                nsg: 169,
            },
        }))
        const ctx = makeCtx({ scene })
        const res = getSymmetryPanelInfo(ctx, { sceneId: 100, objId: 1 })
        expect(res.hasInfo).toBe(true)
        expect(res.cellOk).toBe(true)
        expect(res.isMol).toBe(true)
        expect(res.info?.lattice).toBe('HEXAGONAL')
        expect(res.info?.nsg).toBe(169)
    })

    it('flags cellOk=false when any cell axis is below 0.1', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => makeObjWithCrystalInfo({
            info: {
                lattice: 'TRICLINIC', hm_spacegroup: 'P 1',
                a: 0.05, b: 1, c: 1,
                alpha: 90, beta: 90, gamma: 90,
                nsg: 1,
            },
        }))
        const ctx = makeCtx({ scene })
        const res = getSymmetryPanelInfo(ctx, { sceneId: 100, objId: 1 })
        expect(res.cellOk).toBe(false)
    })

    it('reports isMol=false for DensityMap', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => makeObjWithCrystalInfo({
            className: 'DensityMap',
            info: {
                lattice: 'CUBIC', hm_spacegroup: 'P 1',
                a: 100, b: 100, c: 100,
                alpha: 90, beta: 90, gamma: 90,
                nsg: 1,
            },
        }))
        const ctx = makeCtx({ scene })
        const res = getSymmetryPanelInfo(ctx, { sceneId: 100, objId: 1 })
        expect(res.isMol).toBe(false)
        expect(res.cellOk).toBe(true)
    })
})

describe('changeSymmetryInfo', () => {
    beforeEach(() => vi.clearAllMocks())

    it('passes the cell+nsg tuple to SymmOpManager.changeXtalInfo inside a "Change symminfo" undo txn', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => makeObjWithCrystalInfo())
        const changeXtalInfo = vi.fn()
        const ctx = makeCtx({ scene, symmMgr: { changeXtalInfo } })
        const res = changeSymmetryInfo(ctx, {
            sceneId: 100, objId: 42,
            a: 50, b: 50, c: 60, alpha: 90, beta: 90, gamma: 120, nsg: 152,
        })
        expect(res).toEqual({ ok: true })
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Change symminfo')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(scene.rollbackUndoTxn).not.toHaveBeenCalled()
        expect(changeXtalInfo).toHaveBeenCalledWith(42, 50, 50, 60, 90, 90, 120, 152)
    })

    it('returns ok=false when SymmOpManager is unavailable', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => makeObjWithCrystalInfo())
        const ctx = makeCtx({ scene, symmMgr: null })
        const res = changeSymmetryInfo(ctx, {
            sceneId: 100, objId: 1,
            a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90, nsg: 1,
        })
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/SymmOpManager/) }))
    })

    it('returns the error message when changeXtalInfo throws', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => makeObjWithCrystalInfo())
        const changeXtalInfo = vi.fn(() => { throw new Error('bad sg') })
        const ctx = makeCtx({ scene, symmMgr: { changeXtalInfo } })
        const res = changeSymmetryInfo(ctx, {
            sceneId: 100, objId: 1,
            a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90, nsg: 1,
        })
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/bad sg/) }))
        // A throwing mutation must roll the txn back and must NOT commit a
        // bogus undo entry (the error message is also carried through).
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })
})

describe('showUnitCellRenderer', () => {
    beforeEach(() => vi.clearAllMocks())

    it('short-circuits with created=false when *unitcell renderer already exists', () => {
        const obj = {
            getRendererByType: vi.fn((type: string) => (type === '*unitcell' ? {} : null)),
            createRenderer: vi.fn(),
            getExtData: vi.fn(),
            getClassName: vi.fn(() => 'MolCoord'),
        }
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => obj)
        const ctx = makeCtx({ scene })
        const res = showUnitCellRenderer(ctx, { sceneId: 100, objId: 1 })
        expect(res).toEqual({ ok: true, created: false })
        expect(obj.createRenderer).not.toHaveBeenCalled()
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })

    it('creates the *unitcell renderer inside a "Show unitcell" undo txn', () => {
        let nameSet: string | null = null
        const newRend = {
            get name() { return '' },
            set name(v: string) { nameSet = v },
        }
        const obj = {
            getRendererByType: vi.fn(() => null),
            createRenderer: vi.fn(() => newRend),
            getExtData: vi.fn(),
            getClassName: vi.fn(() => 'MolCoord'),
        }
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => obj)
        const ctx = makeCtx({ scene })
        const res = showUnitCellRenderer(ctx, { sceneId: 100, objId: 1 })
        expect(res).toEqual({ ok: true, created: true })
        expect(obj.createRenderer).toHaveBeenCalledWith('*unitcell')
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Show unitcell')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(nameSet).toBe('unitcell')
    })

    it('rolls back without committing when createRenderer throws (no created flag)', () => {
        const obj = {
            getRendererByType: vi.fn(() => null),
            createRenderer: vi.fn(() => { throw new Error('cannot create') }),
            getExtData: vi.fn(),
            getClassName: vi.fn(() => 'MolCoord'),
        }
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => obj)
        const ctx = makeCtx({ scene })
        const res = showUnitCellRenderer(ctx, { sceneId: 100, objId: 1 })
        // A Fail carries no payload: `created` is only ever reported on success.
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/cannot create/) }))
        expect(res).not.toHaveProperty('created')
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })
})

describe('showSymmRenderer', () => {
    beforeEach(() => vi.clearAllMocks())

    function makeSymmRendObj() {
        const props: Record<string, unknown> = {}
        const rend = {
            get name() { return '' },
            set name(_v: string) { /* tracked elsewhere */ },
            setProp: vi.fn((k: string, v: unknown) => { props[k] = v }),
        }
        let existing: typeof rend | null = null
        const obj = {
            getRendererByType: vi.fn((type: string) => (type === '*symm' ? existing : null)),
            createRenderer: vi.fn(() => {
                existing = rend
                return rend
            }),
            getExtData: vi.fn(),
            getClassName: vi.fn(() => 'MolCoord'),
        }
        return { obj, rend, props }
    }

    it("extent='unitcell' sets unitcell=true / autoupdate=false / no center", () => {
        const { obj, props } = makeSymmRendObj()
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => obj)
        const ctx = makeCtx({ scene })
        const res = showSymmRenderer(ctx, {
            sceneId: 100, objId: 1, viewId: 1, extent: 'unitcell',
        })
        expect(res).toEqual({ ok: true })
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Show sym mol')
        expect(props.unitcell).toBe(true)
        expect(props.autoupdate).toBe(false)
        expect(props.center).toBeUndefined()
        expect(props.extent).toBeUndefined()
    })

    it('finite extent sets extent + unitcell=false + autoupdate=true + center', () => {
        const { obj, props } = makeSymmRendObj()
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => obj)
        const vector = { wrapped: { __vec: 'native' } }
        const view = {
            getViewCenter: vi.fn(() => vector),
            getScene: vi.fn(() => scene),
        }
        const ctx = makeCtx({ scene, view, viewId: 7 })
        const res = showSymmRenderer(ctx, {
            sceneId: 100, objId: 1, viewId: 7, extent: 20,
        })
        expect(res).toEqual({ ok: true })
        expect(props.extent).toBe(20)
        expect(props.unitcell).toBe(false)
        expect(props.autoupdate).toBe(true)
        // center is unwrapped from the Vector wrapper to its native handle.
        expect(props.center).toEqual({ __vec: 'native' })
        expect(view.getViewCenter).toHaveBeenCalled()
    })

    it('rolls back without committing when setupSymmRenderer throws', () => {
        const obj = {
            getRendererByType: vi.fn(() => null),
            createRenderer: vi.fn(() => { throw new Error('symm create failed') }),
            getExtData: vi.fn(),
            getClassName: vi.fn(() => 'MolCoord'),
        }
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => obj)
        const ctx = makeCtx({ scene })
        const res = showSymmRenderer(ctx, {
            sceneId: 100, objId: 1, viewId: 1, extent: 'unitcell',
        })
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/symm create failed/) }))
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })
})
