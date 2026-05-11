import { describe, it, expect, vi } from 'vitest'

vi.mock('../worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn((_ctx: unknown, selStr: string) =>
        selStr === null || selStr === undefined ? null : { __sel: selStr },
    ),
}))

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
            for (const nt of ['scene', 'camera', 'style', 'cameraRoot', 'styleRoot'] as const) {
                expect(services.renameNode(ctx, {
                    sceneId: 1, nodeId: 1, nodeType: nt, newName: 'x',
                }).ok).toBe(false)
            }
        })
    })

    describe('selectObjectMol', () => {
        function makeMolCtx(opts: {
            prevSelStr?: string
            hasSelRend?: boolean
        } = {}) {
            const setSel = vi.fn()
            const createRenderer = vi.fn()
            const getRendererByType = vi.fn(() =>
                opts.hasSelRend ? { __selRend: true } : null,
            )
            const mol = {
                get sel() {
                    return opts.prevSelStr === undefined
                        ? null
                        : { toString: () => opts.prevSelStr! }
                },
                set sel(v: unknown) { setSel(v) },
                getRendererByType,
                createRenderer,
            }
            const startUndoTxn = vi.fn()
            const commitUndoTxn = vi.fn()
            const rollbackUndoTxn = vi.fn()
            const mockScene = {
                uid: 7,
                getObject: vi.fn(() => mol),
                startUndoTxn,
                commitUndoTxn,
                rollbackUndoTxn,
            }
            const ctx = {
                sceMgr: { getScene: vi.fn(() => mockScene) },
            } as unknown as WorkerContext
            return {
                ctx, mockScene, mol,
                setSel, createRenderer, getRendererByType,
                startUndoTxn, commitUndoTxn,
            }
        }

        it.each([
            ['all', '*', 'Select all atoms'],
            ['protein', 'protein', 'Select protein'],
            ['nucleic', 'nucleic', 'Select nucleic'],
            ['water', 'water', 'Select water'],
            ['sugar', 'sugar', 'Select sugar'],
            ['hydrogen', 'elem H', 'Select hydrogen'],
        ] as const)('maps %s to selStr=%s with undo label %s', (kind, expectedSel, expectedLabel) => {
            const { ctx, setSel, startUndoTxn } = makeMolCtx()
            const res = services.selectObjectMol(ctx, {
                sceneId: 1, objId: 10, kind,
            })
            expect(res.ok).toBe(true)
            expect(startUndoTxn).toHaveBeenCalledWith(expectedLabel)
            expect(setSel).toHaveBeenCalledWith({ __sel: expectedSel })
        })

        it('unselect sends empty selStr', () => {
            const { ctx, setSel, startUndoTxn } = makeMolCtx({ prevSelStr: 'protein' })
            services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'unselect' })
            expect(startUndoTxn).toHaveBeenCalledWith('Unselect molecule')
            expect(setSel).toHaveBeenCalledWith({ __sel: '' })
        })

        it('invert wraps non-negated input in !(...)', () => {
            const { ctx, setSel } = makeMolCtx({ prevSelStr: 'protein' })
            services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'invert' })
            expect(setSel).toHaveBeenCalledWith({ __sel: '!(protein)' })
        })

        it('invert unwraps !(...) input', () => {
            const { ctx, setSel } = makeMolCtx({ prevSelStr: '!(protein)' })
            services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'invert' })
            expect(setSel).toHaveBeenCalledWith({ __sel: 'protein' })
        })

        it('invert from empty selection selects all', () => {
            const { ctx, setSel } = makeMolCtx({ prevSelStr: '' })
            services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'invert' })
            expect(setSel).toHaveBeenCalledWith({ __sel: '*' })
        })

        it('sidechain toggle prepends bysidech when absent', () => {
            const { ctx, setSel } = makeMolCtx({ prevSelStr: 'aid 1' })
            services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'sidechain' })
            expect(setSel).toHaveBeenCalledWith({ __sel: 'bysidech aid 1' })
        })

        it('sidechain toggle strips bysidech when present', () => {
            const { ctx, setSel } = makeMolCtx({ prevSelStr: 'bysidech aid 1' })
            services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'sidechain' })
            expect(setSel).toHaveBeenCalledWith({ __sel: 'aid 1' })
        })

        it('sidechain toggle is a no-op when selection is empty', () => {
            const { ctx, setSel, startUndoTxn } = makeMolCtx({ prevSelStr: '' })
            const res = services.selectObjectMol(ctx, {
                sceneId: 1, objId: 10, kind: 'sidechain',
            })
            expect(res.ok).toBe(false)
            expect(startUndoTxn).not.toHaveBeenCalled()
            expect(setSel).not.toHaveBeenCalled()
        })

        it('auto-creates *selection renderer when missing', () => {
            const { ctx, createRenderer } = makeMolCtx({ hasSelRend: false })
            services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'all' })
            expect(createRenderer).toHaveBeenCalledWith('*selection')
        })

        it('skips renderer creation when *selection already exists', () => {
            const { ctx, createRenderer } = makeMolCtx({ hasSelRend: true })
            services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'all' })
            expect(createRenderer).not.toHaveBeenCalled()
        })

        it('returns ok:false when scene missing', () => {
            const ctx = {
                sceMgr: { getScene: () => null },
            } as unknown as WorkerContext
            const res = services.selectObjectMol(ctx, {
                sceneId: 1, objId: 10, kind: 'all',
            })
            expect(res.ok).toBe(false)
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
