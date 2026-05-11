import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/sceneOps.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

interface SceneOverrides {
    getObject?: ReturnType<typeof vi.fn>
    getRenderer?: ReturnType<typeof vi.fn>
}

function makeCtx(overrides: SceneOverrides = {}) {
    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()
    const mockView = {
        setViewCenter: vi.fn(),
    }
    const mockScene = {
        getObject: overrides.getObject ?? vi.fn(() => null),
        getRenderer: overrides.getRenderer ?? vi.fn(() => null),
        destroyObject: vi.fn(() => true),
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }
    const getScene = vi.fn(() => mockScene)
    const getView = vi.fn(() => mockView)
    const ctx = {
        sceMgr: { getScene, getView },
    } as unknown as WorkerContext
    return { ctx, mockScene, mockView, startUndoTxn, commitUndoTxn, rollbackUndoTxn }
}

describe('sceneOps service', () => {
    describe('focusOnNode', () => {
        it('returns ok:false when scene is missing', () => {
            const ctx = {
                sceMgr: {
                    getScene: () => null,
                    getView: () => ({}),
                },
            } as unknown as WorkerContext
            const res = services.focusOnNode(ctx, {
                sceneId: 1, viewId: 1, nodeId: 10, nodeType: 'object',
            })
            expect(res.ok).toBe(false)
        })

        it('calls obj.fitView(view, false) for object node when fitView exists', () => {
            const fitView = vi.fn()
            const mol = { fitView }
            const { ctx, mockView } = makeCtx({ getObject: vi.fn(() => mol) })
            const res = services.focusOnNode(ctx, {
                sceneId: 1, viewId: 2, nodeId: 10, nodeType: 'object',
            })
            expect(res.ok).toBe(true)
            expect(fitView).toHaveBeenCalledWith(mockView, false)
        })

        it('returns ok:false for object node when fitView is unavailable', () => {
            const mol = {}
            const { ctx } = makeCtx({ getObject: vi.fn(() => mol) })
            const res = services.focusOnNode(ctx, {
                sceneId: 1, viewId: 2, nodeId: 10, nodeType: 'object',
            })
            expect(res.ok).toBe(false)
        })

        it('uses fitView2(view, rend.sel) when renderer has both sel and client.fitView2', () => {
            const fitView2 = vi.fn()
            const sel = { __sel: true }
            const client = { fitView2 }
            const rend = { sel, getClientObj: () => client }
            const { ctx, mockView } = makeCtx({ getRenderer: vi.fn(() => rend) })
            const res = services.focusOnNode(ctx, {
                sceneId: 1, viewId: 2, nodeId: 100, nodeType: 'renderer',
            })
            expect(res.ok).toBe(true)
            expect(fitView2).toHaveBeenCalledWith(mockView, sel)
        })

        it('falls back to view.setViewCenter when renderer has has_center but no fitView', () => {
            const pos = { __pos: true }
            const rend = {
                sel: null,
                has_center: true,
                getCenter: () => pos,
                getClientObj: () => ({}),  // no fitView
            }
            const { ctx, mockView } = makeCtx({ getRenderer: vi.fn(() => rend) })
            const res = services.focusOnNode(ctx, {
                sceneId: 1, viewId: 2, nodeId: 100, nodeType: 'renderer',
            })
            expect(res.ok).toBe(true)
            expect(mockView.setViewCenter).toHaveBeenCalledWith(pos)
        })

        it('returns ok:false for unsupported node types', () => {
            const { ctx } = makeCtx()
            expect(services.focusOnNode(ctx, {
                sceneId: 1, viewId: 2, nodeId: 1, nodeType: 'scene',
            }).ok).toBe(false)
            expect(services.focusOnNode(ctx, {
                sceneId: 1, viewId: 2, nodeId: -1, nodeType: 'cameraRoot',
            }).ok).toBe(false)
        })
    })

    describe('deleteNode', () => {
        it('destroys object inside undo txn', () => {
            const obj = { name: 'mol1' }
            const { ctx, mockScene, startUndoTxn, commitUndoTxn } = makeCtx({
                getObject: vi.fn(() => obj),
            })
            const res = services.deleteNode(ctx, {
                sceneId: 1, nodeId: 10, nodeType: 'object',
            })
            expect(res.ok).toBe(true)
            expect(startUndoTxn).toHaveBeenCalledWith('Destroy object mol1')
            expect(mockScene.destroyObject).toHaveBeenCalledWith(10)
            expect(commitUndoTxn).toHaveBeenCalled()
        })

        it('destroys renderer via client object inside undo txn', () => {
            const destroyRenderer = vi.fn()
            const client = { name: 'mol1', destroyRenderer }
            const rend = { name: 'rend1', getClientObj: () => client }
            const { ctx, startUndoTxn } = makeCtx({
                getRenderer: vi.fn(() => rend),
            })
            const res = services.deleteNode(ctx, {
                sceneId: 1, nodeId: 100, nodeType: 'renderer',
            })
            expect(res.ok).toBe(true)
            expect(startUndoTxn).toHaveBeenCalledWith('Delete renderer: mol1/rend1')
            expect(destroyRenderer).toHaveBeenCalledWith(100)
        })

        it('destroys rendGroup children then the group itself in a single txn', () => {
            const destroyRenderer = vi.fn()
            const client = { name: 'mol1', destroyRenderer }
            const grp = { name: 'g1', getClientObj: () => client }
            const { ctx, startUndoTxn, commitUndoTxn } = makeCtx({
                getRenderer: vi.fn(() => grp),
            })
            const res = services.deleteNode(ctx, {
                sceneId: 1, nodeId: 50, nodeType: 'rendGroup', childIds: [101, 102],
            })
            expect(res.ok).toBe(true)
            expect(startUndoTxn).toHaveBeenCalledTimes(1)
            expect(destroyRenderer.mock.calls.map((c) => c[0])).toEqual([101, 102, 50])
            expect(commitUndoTxn).toHaveBeenCalledTimes(1)
        })

        it('returns ok:false for camera/style/scene nodes (Phase 2 out of scope)', () => {
            const { ctx } = makeCtx()
            for (const nt of ['scene', 'camera', 'style', 'cameraRoot', 'styleRoot'] as const) {
                expect(services.deleteNode(ctx, {
                    sceneId: 1, nodeId: 1, nodeType: nt,
                }).ok).toBe(false)
            }
        })

        it('rolls back undo txn when destroyObject throws', () => {
            const obj = { name: 'mol1' }
            const { ctx, mockScene, rollbackUndoTxn, commitUndoTxn } = makeCtx({
                getObject: vi.fn(() => obj),
            })
            mockScene.destroyObject.mockImplementation(() => { throw new Error('boom') })
            expect(() => services.deleteNode(ctx, {
                sceneId: 1, nodeId: 10, nodeType: 'object',
            })).toThrow('boom')
            expect(rollbackUndoTxn).toHaveBeenCalled()
            expect(commitUndoTxn).not.toHaveBeenCalled()
        })
    })

    describe('getNodeInfo', () => {
        it('returns empty entries when scene missing', () => {
            const ctx = {
                sceMgr: { getScene: () => null, getView: () => null },
            } as unknown as WorkerContext
            const res = services.getNodeInfo(ctx, { sceneId: 1, nodeId: 1, nodeType: 'scene' })
            expect(res.ok).toBe(false)
            expect(res.entries).toHaveLength(0)
        })

        it('collects name / visible / locked for an object', () => {
            const obj = { uid: 10, name: 'mol1', visible: true, locked: false, className: 'PDBMol' }
            const { ctx } = makeCtx({ getObject: vi.fn(() => obj) })
            const res = services.getNodeInfo(ctx, {
                sceneId: 1, nodeId: 10, nodeType: 'object',
            })
            expect(res.ok).toBe(true)
            expect(res.displayName).toBe('mol1')
            const keyMap = Object.fromEntries(res.entries.map((e) => [e.key, e.value]))
            expect(keyMap.uid).toBe('10')
            expect(keyMap.name).toBe('mol1')
            expect(keyMap.visible).toBe('true')
            expect(keyMap.className).toBe('PDBMol')
        })

        it('returns empty for camera/style (Phase 2 out of scope)', () => {
            const { ctx } = makeCtx()
            const r1 = services.getNodeInfo(ctx, { sceneId: 1, nodeId: -1, nodeType: 'camera' })
            const r2 = services.getNodeInfo(ctx, { sceneId: 1, nodeId: -2, nodeType: 'cameraRoot' })
            expect(r1.ok).toBe(false)
            expect(r2.ok).toBe(false)
        })

        it('survives a property getter throwing', () => {
            const obj = {
                get name() { throw new Error('access') },
                visible: true,
            }
            const { ctx } = makeCtx({ getObject: vi.fn(() => obj) })
            const res = services.getNodeInfo(ctx, {
                sceneId: 1, nodeId: 10, nodeType: 'object',
            })
            expect(res.ok).toBe(true)
            const keyMap = Object.fromEntries(res.entries.map((e) => [e.key, e.value]))
            expect(keyMap.visible).toBe('true')
            expect(keyMap.name).toBeUndefined()  // skipped on throw
        })
    })
})
