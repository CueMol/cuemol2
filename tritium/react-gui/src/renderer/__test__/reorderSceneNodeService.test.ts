import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/reorderSceneNode.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

/**
 * Construct a parent-object whose renderer list (rend1, rend2, rend3, ...)
 * carries the given ui_order values. The returned objects record ui_order
 * mutations via `setUiOrder` so tests can verify the swap path exactly.
 */
function makeRenderers(orders: number[]) {
    const recs = orders.map((o, idx) => {
        let _order = o
        const setUiOrder = vi.fn((v: number) => { _order = v })
        const rend = {
            uid: 100 + idx,
            get ui_order(): number { return _order },
            set ui_order(v: number) { setUiOrder(v) },
            // group is mutable; default empty.
            __group: '',
            get group(): string { return (this as unknown as { __group: string }).__group },
            set group(v: string) { (this as unknown as { __group: string }).__group = v },
        }
        return { rend, setUiOrder }
    })
    return recs
}

function makeObjects(orders: number[]) {
    const recs = orders.map((o, idx) => {
        let _order = o
        const setUiOrder = vi.fn((v: number) => { _order = v })
        const obj = {
            uid: 10 + idx,
            get ui_order(): number { return _order },
            set ui_order(v: number) { setUiOrder(v) },
            rend_uids: '',
        }
        return { obj, setUiOrder }
    })
    return recs
}

interface SceneFixtureOpts {
    /** Renderers attached to obj1 (idx 0..n with ui_order = idx). */
    rendOrders?: number[]
    /** Objects in scene (idx 0..n with ui_order = idx). */
    objOrders?: number[]
    /** uid -> entity overrides used by scene.getRenderer / scene.getObject. */
    extraObjs?: Record<number, unknown>
}

function makeFixture(opts: SceneFixtureOpts = {}) {
    const rendRecs = makeRenderers(opts.rendOrders ?? [])
    // Renderer tests need a parent obj for destObjId; default to one obj if
    // only rendOrders is provided so the renderer branch can resolve it.
    const objOrders = opts.objOrders
        ?? (rendRecs.length > 0 ? [0] : [])
    const objRecs = makeObjects(objOrders)

    const obj1 = objRecs[0]?.obj
    if (obj1) {
        obj1.rend_uids = rendRecs.map((r) => String(r.rend.uid)).join(',')
    }

    const getObject = vi.fn((uid: number) => {
        const found = objRecs.find((r) => r.obj.uid === uid)
        return found ? found.obj : null
    })
    const getRenderer = vi.fn((uid: number) => {
        const found = rendRecs.find((r) => r.rend.uid === uid)
        return found ? found.rend : null
    })

    // Build the JSON shape getSceneDataJSON returns (scene + objects).
    const sceneDataJSON = JSON.stringify([
        { ID: 7, type: '', name: 'Scene' },
        ...objRecs.map((r) => ({ ID: r.obj.uid, type: 'Mol' })),
    ])

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()
    const scene = {
        uid: 7,
        getObject, getRenderer,
        getSceneDataJSON: () => sceneDataJSON,
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }
    Object.assign(scene as unknown as Record<string, unknown>, opts.extraObjs)

    const ctx = {
        sceMgr: { getScene: vi.fn(() => scene) },
    } as unknown as WorkerContext

    return { ctx, scene, rendRecs, objRecs, startUndoTxn, commitUndoTxn }
}

describe('reorderSceneNode.service — renderer move within same parent', () => {
    it('move down by one slot (ori=1) swaps ui_order between adjacent rends', () => {
        const f = makeFixture({ rendOrders: [0, 1, 2, 3] })
        // Move rend at uid=100 (ui_order=0) AFTER uid=101 (ui_order=1).
        const res = services.reorderSceneNode(f.ctx, {
            kind: 'renderer',
            sceneId: 7,
            sourceId: 100,
            destObjId: 10,
            destGroupName: '',
            targetId: 101,
            ori: 1,
        })
        expect(res.ok).toBe(true)
        // Single swap: rend0.ui_order <-> rend1.ui_order
        expect(f.rendRecs[0].rend.ui_order).toBe(1)
        expect(f.rendRecs[1].rend.ui_order).toBe(0)
        expect(f.rendRecs[2].rend.ui_order).toBe(2)
        expect(f.startUndoTxn).toHaveBeenCalledWith('Reorder renderers')
    })

    it('move up across two slots (ori=-1) bubbles ui_order all the way', () => {
        const f = makeFixture({ rendOrders: [0, 1, 2, 3] })
        // Move rend at uid=103 (ui_order=3) BEFORE uid=100 (ui_order=0).
        const res = services.reorderSceneNode(f.ctx, {
            kind: 'renderer',
            sceneId: 7,
            sourceId: 103,
            destObjId: 10,
            destGroupName: '',
            targetId: 100,
            ori: -1,
        })
        expect(res.ok).toBe(true)
        // After bubble: source lands at ui_order=0, others shifted down.
        const orders = f.rendRecs.map((r) => r.rend.ui_order)
        // [3]->0, [0]->1, [1]->2, [2]->3
        expect(orders).toEqual([1, 2, 3, 0])
    })

    it('moving onto own slot (ori=0, same uid) is a no-op', () => {
        const f = makeFixture({ rendOrders: [0, 1, 2] })
        const res = services.reorderSceneNode(f.ctx, {
            kind: 'renderer',
            sceneId: 7,
            sourceId: 100,
            destObjId: 10,
            destGroupName: '',
            targetId: 100,
            ori: 0,
        })
        // ok: true (validate path passes; just no slot change)
        expect(res.ok).toBe(true)
        expect(f.rendRecs[0].rend.ui_order).toBe(0)
        expect(f.rendRecs[1].rend.ui_order).toBe(1)
    })
})

describe('reorderSceneNode.service — renderer cross-group move', () => {
    it('moving into a group sets rend.group BEFORE the bubble-sort', () => {
        const f = makeFixture({ rendOrders: [0, 1, 2] })
        const res = services.reorderSceneNode(f.ctx, {
            kind: 'renderer',
            sceneId: 7,
            sourceId: 100,
            destObjId: 10,
            destGroupName: 'grpA',
            targetId: 102,
            ori: 1,
        })
        expect(res.ok).toBe(true)
        expect(f.rendRecs[0].rend.group).toBe('grpA')
        // Bubble down: 0 -> 2 swapping with 1 then 2.
        const orders = f.rendRecs.map((r) => r.rend.ui_order)
        expect(orders).toEqual([2, 0, 1])
    })

    it('moving out of a group clears rend.group ("")', () => {
        const f = makeFixture({ rendOrders: [0, 1, 2] })
        // Pre-set src in group "grpA"; algorithm should set it back to "".
        f.rendRecs[1].rend.group = 'grpA'
        const res = services.reorderSceneNode(f.ctx, {
            kind: 'renderer',
            sceneId: 7,
            sourceId: 101,
            destObjId: 10,
            destGroupName: '',
            targetId: 102,
            ori: 1,
        })
        expect(res.ok).toBe(true)
        expect(f.rendRecs[1].rend.group).toBe('')
    })

    it('drop INTO empty rendGroup (sourceId === targetId) updates group only, no slot swap', () => {
        const f = makeFixture({ rendOrders: [0, 1] })
        const res = services.reorderSceneNode(f.ctx, {
            kind: 'renderer',
            sceneId: 7,
            sourceId: 100,
            destObjId: 10,
            destGroupName: 'grpA',
            targetId: 100,
            ori: 0,
        })
        expect(res.ok).toBe(true)
        expect(f.rendRecs[0].rend.group).toBe('grpA')
        // ui_order unchanged.
        expect(f.rendRecs[0].rend.ui_order).toBe(0)
        expect(f.rendRecs[1].rend.ui_order).toBe(1)
    })
})

describe('reorderSceneNode.service — object reorder', () => {
    it('move object down (ori=1) swaps ui_order with adjacent obj', () => {
        const f = makeFixture({ objOrders: [0, 1, 2] })
        const res = services.reorderSceneNode(f.ctx, {
            kind: 'object',
            sceneId: 7,
            sourceId: 10,
            targetId: 11,
            ori: 1,
        })
        expect(res.ok).toBe(true)
        const orders = f.objRecs.map((r) => r.obj.ui_order)
        expect(orders).toEqual([1, 0, 2])
        expect(f.startUndoTxn).toHaveBeenCalledWith('Reorder objects')
    })

    it('rejects when source equals target', () => {
        const f = makeFixture({ objOrders: [0, 1] })
        const res = services.reorderSceneNode(f.ctx, {
            kind: 'object',
            sceneId: 7,
            sourceId: 10,
            targetId: 10,
            ori: 1,
        })
        expect(res.ok).toBe(false)
        expect(f.startUndoTxn).not.toHaveBeenCalled()
    })

    it('rejects when source object is missing', () => {
        const f = makeFixture({ objOrders: [0, 1] })
        const res = services.reorderSceneNode(f.ctx, {
            kind: 'object',
            sceneId: 7,
            sourceId: 999,
            targetId: 10,
            ori: 1,
        })
        expect(res.ok).toBe(false)
    })
})

describe('reorderSceneNode.service — scene lookup failure', () => {
    it('returns ok:false when scene cannot be resolved', () => {
        const ctx = {
            sceMgr: { getScene: () => null },
        } as unknown as WorkerContext
        const res = services.reorderSceneNode(ctx, {
            kind: 'object',
            sceneId: 99,
            sourceId: 10,
            targetId: 11,
            ori: 1,
        })
        expect(res.ok).toBe(false)
    })
})
