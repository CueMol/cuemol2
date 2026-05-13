import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/bulkSceneNodeOps.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

interface FixtureOpts {
    /** uid → initial visible state for objects. */
    objs?: Record<number, { visible: boolean }>
    /** uid → initial visible state for renderers (or rendGroups). */
    rends?: Record<number, { visible: boolean }>
    sceneExists?: boolean
}

function makeFixture(opts: FixtureOpts = {}) {
    const objs = opts.objs ?? {}
    const rends = opts.rends ?? {}

    const objRecs: Record<number, {
        visible: boolean
        setVisible: ReturnType<typeof vi.fn>
        destroyRenderer: ReturnType<typeof vi.fn>
    }> = {}
    for (const [uidStr, init] of Object.entries(objs)) {
        const uid = Number(uidStr)
        const setVisible = vi.fn((v: boolean) => { objRecs[uid].visible = v })
        const destroyRenderer = vi.fn()
        objRecs[uid] = {
            visible: init.visible,
            setVisible, destroyRenderer,
        }
    }
    const rendRecs: Record<number, {
        visible: boolean
        setVisible: ReturnType<typeof vi.fn>
        parentUid: number
    }> = {}
    for (const [uidStr, init] of Object.entries(rends)) {
        const uid = Number(uidStr)
        const setVisible = vi.fn((v: boolean) => { rendRecs[uid].visible = v })
        rendRecs[uid] = { visible: init.visible, setVisible, parentUid: 10 }
    }

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()
    const destroyObject = vi.fn()

    const scene = {
        getObject: vi.fn((uid: number) => {
            const rec = objRecs[uid]
            if (!rec) return null
            return {
                uid,
                get visible(): boolean { return rec.visible },
                set visible(v: boolean) { rec.setVisible(v) },
                destroyRenderer: rec.destroyRenderer,
            }
        }),
        getRenderer: vi.fn((uid: number) => {
            const rec = rendRecs[uid]
            if (!rec) return null
            const objRec = objRecs[rec.parentUid]
            const parent = objRec
                ? {
                    destroyRenderer: objRec.destroyRenderer,
                }
                : null
            return {
                uid,
                get visible(): boolean { return rec.visible },
                set visible(v: boolean) { rec.setVisible(v) },
                getClientObj: () => parent,
            }
        }),
        destroyObject,
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (opts.sceneExists === false ? null : scene)) },
    } as unknown as WorkerContext

    return {
        ctx, scene, objRecs, rendRecs, destroyObject,
        startUndoTxn, commitUndoTxn,
    }
}

describe('bulkSceneNodeOps.bulkSetNodeVisible', () => {
    it('shows multiple objects + renderers under a single "Show multiple" txn', () => {
        const f = makeFixture({
            objs: { 10: { visible: false } },
            rends: { 100: { visible: false }, 101: { visible: true } },
        })
        const res = services.bulkSetNodeVisible(f.ctx, {
            sceneId: 7,
            visible: true,
            items: [
                { nodeId: 10, nodeType: 'object' },
                { nodeId: 100, nodeType: 'renderer' },
                { nodeId: 101, nodeType: 'renderer' },
            ],
        })
        expect(res).toEqual({ ok: true, applied: 3 })
        expect(f.startUndoTxn).toHaveBeenCalledWith('Show multiple')
        expect(f.commitUndoTxn).toHaveBeenCalledTimes(1)
        expect(f.objRecs[10].setVisible).toHaveBeenCalledWith(true)
        expect(f.rendRecs[100].setVisible).toHaveBeenCalledWith(true)
        // Already visible → skip the property write per UXP onShowHideCmd.
        expect(f.rendRecs[101].setVisible).not.toHaveBeenCalled()
    })

    it('hides multiple under "Hide multiple" txn', () => {
        const f = makeFixture({
            objs: { 10: { visible: true } },
            rends: { 100: { visible: true } },
        })
        const res = services.bulkSetNodeVisible(f.ctx, {
            sceneId: 7,
            visible: false,
            items: [
                { nodeId: 10, nodeType: 'object' },
                { nodeId: 100, nodeType: 'renderer' },
            ],
        })
        expect(res.ok).toBe(true)
        expect(f.startUndoTxn).toHaveBeenCalledWith('Hide multiple')
        expect(f.objRecs[10].setVisible).toHaveBeenCalledWith(false)
        expect(f.rendRecs[100].setVisible).toHaveBeenCalledWith(false)
    })

    it('rejects when all items are non-operable types', () => {
        const f = makeFixture({})
        const res = services.bulkSetNodeVisible(f.ctx, {
            sceneId: 7,
            visible: true,
            items: [
                { nodeId: -1, nodeType: 'cameraRoot' },
                { nodeId: -2, nodeType: 'styleRoot' },
            ],
        })
        expect(res).toEqual({ ok: false, applied: 0 })
        expect(f.startUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok:false when scene cannot be resolved', () => {
        const f = makeFixture({ sceneExists: false })
        const res = services.bulkSetNodeVisible(f.ctx, {
            sceneId: 99,
            visible: true,
            items: [{ nodeId: 10, nodeType: 'object' }],
        })
        expect(res).toEqual({ ok: false, applied: 0 })
    })
})

describe('bulkSceneNodeOps.bulkDeleteNode', () => {
    it('destroys objects + renderers + rendGroups under a single "Delete multiple" txn', () => {
        const f = makeFixture({
            objs: { 10: { visible: true } },
            rends: {
                100: { visible: true },
                200: { visible: true },  // rendGroup
                201: { visible: true },  // child of group 200
            },
        })
        const res = services.bulkDeleteNode(f.ctx, {
            sceneId: 7,
            items: [
                { nodeId: 100, nodeType: 'renderer' },
                { nodeId: 200, nodeType: 'rendGroup', childIds: [201] },
                { nodeId: 10, nodeType: 'object' },
            ],
        })
        expect(res).toEqual({ ok: true, applied: 3 })
        expect(f.startUndoTxn).toHaveBeenCalledWith('Delete multiple')
        // renderer 100 destroyed via parent obj.
        expect(f.objRecs[10].destroyRenderer).toHaveBeenCalledWith(100)
        // rendGroup 200: child 201 first, then 200 itself.
        expect(f.objRecs[10].destroyRenderer).toHaveBeenCalledWith(201)
        expect(f.objRecs[10].destroyRenderer).toHaveBeenCalledWith(200)
        // object 10 destroyed via scene.destroyObject.
        expect(f.destroyObject).toHaveBeenCalledWith(10)
    })

    it('skips items that cannot be resolved but still applies the rest', () => {
        const f = makeFixture({ objs: { 10: { visible: true } } })
        const res = services.bulkDeleteNode(f.ctx, {
            sceneId: 7,
            items: [
                { nodeId: 999, nodeType: 'object' },  // not in fixture
                { nodeId: 10, nodeType: 'object' },
            ],
        })
        expect(res.applied).toBe(1)
        expect(f.destroyObject).toHaveBeenCalledTimes(1)
        expect(f.destroyObject).toHaveBeenCalledWith(10)
    })
})
