import { describe, it, expect, vi } from 'vitest'

import { services } from '@renderer/worker/server/services/sceneTree/sceneTree.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

interface SceneOverrides {
    getObject?: ReturnType<typeof vi.fn>
    getRenderer?: ReturnType<typeof vi.fn>
    getRendByName?: ReturnType<typeof vi.fn>
    setName?: ReturnType<typeof vi.fn>
}

function makeCtx(overrides: SceneOverrides = {}) {
    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()
    const mockView = {
        setViewCenter: vi.fn(),
    }
    const setName = overrides.setName ?? vi.fn()
    const mockScene = {
        getObject: overrides.getObject ?? vi.fn(() => null),
        getRenderer: overrides.getRenderer ?? vi.fn(() => null),
        getRendByName: overrides.getRendByName ?? vi.fn(() => null),
        destroyObject: vi.fn(() => true),
        setName,
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }
    const getScene = vi.fn(() => mockScene)
    const getView = vi.fn(() => mockView)
    const ctx = {
        sceMgr: { getScene, getView },
    } as unknown as WorkerContext
    return { ctx, mockScene, mockView, setName, startUndoTxn, commitUndoTxn, rollbackUndoTxn }
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

    describe('renameNode', () => {
        it('sets .name on object via undo txn', () => {
            const setName = vi.fn()
            const obj = {
                get name() { return 'before' },
                set name(v: string) { setName(v) },
            }
            const { ctx, startUndoTxn, commitUndoTxn } = makeCtx({
                getObject: vi.fn(() => obj),
            })
            const res = services.renameNode(ctx, {
                sceneId: 1, nodeId: 10, nodeType: 'object', newName: 'after',
            })
            expect(res.ok).toBe(true)
            expect(startUndoTxn).toHaveBeenCalledWith('Rename to after')
            expect(setName).toHaveBeenCalledWith('after')
            expect(commitUndoTxn).toHaveBeenCalled()
        })

        it('sets .name on renderer via undo txn', () => {
            const setName = vi.fn()
            const rend = {
                get name() { return 'r1' },
                set name(v: string) { setName(v) },
            }
            const { ctx } = makeCtx({ getRenderer: vi.fn(() => rend) })
            const res = services.renameNode(ctx, {
                sceneId: 1, nodeId: 100, nodeType: 'renderer', newName: 'r2',
            })
            expect(res.ok).toBe(true)
            expect(setName).toHaveBeenCalledWith('r2')
        })

        it('trims whitespace from the new name', () => {
            const setName = vi.fn()
            const obj = {
                get name() { return 'old' },
                set name(v: string) { setName(v) },
            }
            const { ctx, startUndoTxn } = makeCtx({ getObject: vi.fn(() => obj) })
            services.renameNode(ctx, {
                sceneId: 1, nodeId: 10, nodeType: 'object', newName: '  spaced  ',
            })
            expect(startUndoTxn).toHaveBeenCalledWith('Rename to spaced')
            expect(setName).toHaveBeenCalledWith('spaced')
        })

        it('rejects empty / whitespace-only names', () => {
            const setName = vi.fn()
            const obj = {
                get name() { return 'old' },
                set name(v: string) { setName(v) },
            }
            const { ctx, startUndoTxn } = makeCtx({ getObject: vi.fn(() => obj) })
            const res = services.renameNode(ctx, {
                sceneId: 1, nodeId: 10, nodeType: 'object', newName: '   ',
            })
            expect(res.ok).toBe(false)
            expect(startUndoTxn).not.toHaveBeenCalled()
            expect(setName).not.toHaveBeenCalled()
        })

        it('returns ok:false for unsupported node types', () => {
            const { ctx } = makeCtx()
            // 'scene' has its own branch and is tested below; camera and
            // style intentionally reject here (camera routes through
            // cameraOps.renameCamera; style has no UXP rename handler).
            for (const nt of ['camera', 'style', 'cameraRoot', 'styleRoot'] as const) {
                expect(services.renameNode(ctx, {
                    sceneId: 1, nodeId: 1, nodeType: nt, newName: 'x',
                }).ok).toBe(false)
            }
        })

        it('renames rendGroup and re-assigns each member group string in one txn', () => {
            const setGrpName = vi.fn()
            const setChildGroup = vi.fn()
            const setOtherGroup = vi.fn()
            const clientObj = { rend_uids: '50,100,101' }
            const grp = {
                uid: 50,
                get name() { return 'oldGrp' },
                set name(v: string) { setGrpName(v) },
                getClientObj: () => clientObj,
            }
            const child = {
                uid: 100,
                get group() { return 'oldGrp' },
                set group(v: string) { setChildGroup(v) },
            }
            const other = {
                uid: 101,
                get group() { return '' },
                set group(v: string) { setOtherGroup(v) },
            }
            const getRenderer = vi.fn((uid: number) =>
                uid === 50 ? grp : uid === 100 ? child : uid === 101 ? other : null)
            const { ctx, startUndoTxn, commitUndoTxn } = makeCtx({ getRenderer })
            const res = services.renameNode(ctx, {
                sceneId: 1, nodeId: 50, nodeType: 'rendGroup', newName: 'newGrp',
            })
            expect(res.ok).toBe(true)
            // Single txn, UXP onRenameRendGrp label.
            expect(startUndoTxn).toHaveBeenCalledTimes(1)
            expect(startUndoTxn).toHaveBeenCalledWith('Change rend group name: newGrp')
            expect(setGrpName).toHaveBeenCalledWith('newGrp')
            // Member matched by OLD group name follows; unrelated sibling stays.
            expect(setChildGroup).toHaveBeenCalledWith('newGrp')
            expect(setOtherGroup).not.toHaveBeenCalled()
            expect(commitUndoTxn).toHaveBeenCalledTimes(1)
        })

        it('rejects rendGroup rename when another renderer holds the name scene-wide', () => {
            const setGrpName = vi.fn()
            const grp = {
                uid: 50,
                get name() { return 'oldGrp' },
                set name(v: string) { setGrpName(v) },
                getClientObj: () => null,
            }
            const { ctx, startUndoTxn } = makeCtx({
                getRenderer: vi.fn(() => grp),
                getRendByName: vi.fn(() => ({ uid: 60 })),
            })
            const res = services.renameNode(ctx, {
                sceneId: 1, nodeId: 50, nodeType: 'rendGroup', newName: 'taken',
            })
            expect(res.ok).toBe(false)
            expect(startUndoTxn).not.toHaveBeenCalled()
            expect(setGrpName).not.toHaveBeenCalled()
        })

        it('allows rendGroup rename when getRendByName resolves to the group itself', () => {
            const setGrpName = vi.fn()
            const grp = {
                uid: 50,
                get name() { return 'oldGrp' },
                set name(v: string) { setGrpName(v) },
                getClientObj: () => null,
            }
            const { ctx } = makeCtx({
                getRenderer: vi.fn(() => grp),
                getRendByName: vi.fn(() => grp),
            })
            const res = services.renameNode(ctx, {
                sceneId: 1, nodeId: 50, nodeType: 'rendGroup', newName: 'oldGrp',
            })
            expect(res.ok).toBe(true)
            expect(setGrpName).toHaveBeenCalledWith('oldGrp')
        })

        it('renames the scene via scene.setName under undo txn', () => {
            const { ctx, setName, startUndoTxn, commitUndoTxn } = makeCtx()
            const res = services.renameNode(ctx, {
                sceneId: 1, nodeId: 1, nodeType: 'scene', newName: 'My Scene',
            })
            expect(res.ok).toBe(true)
            expect(startUndoTxn).toHaveBeenCalledWith('Rename to My Scene')
            // Scene.name is read-only at the .qif level, so the worker
            // calls setName(name) rather than assigning to .name.
            expect(setName).toHaveBeenCalledWith('My Scene')
            expect(commitUndoTxn).toHaveBeenCalled()
        })

        it('trims whitespace on scene rename', () => {
            const { ctx, setName } = makeCtx()
            services.renameNode(ctx, {
                sceneId: 1, nodeId: 1, nodeType: 'scene', newName: '  Trimmed  ',
            })
            expect(setName).toHaveBeenCalledWith('Trimmed')
        })

        it('rejects whitespace-only scene rename', () => {
            const { ctx, setName } = makeCtx()
            const res = services.renameNode(ctx, {
                sceneId: 1, nodeId: 1, nodeType: 'scene', newName: '   ',
            })
            expect(res.ok).toBe(false)
            expect(setName).not.toHaveBeenCalled()
        })
    })
})
