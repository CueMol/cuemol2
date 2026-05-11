import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/sceneTree.service'
import { parseSceneTreeJSON } from '../worker/shared/sceneTreeTypes'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

function makeCtx(
    jsonOrScene: string | null | object,
    opts: { cameraInfoJSON?: string; styleNamesJSON?: string } = {},
) {
    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()
    const setObjectVisible = vi.fn()
    const setRendererVisible = vi.fn()

    const mockObject = {
        get visible() { return true },
        set visible(v: boolean) { setObjectVisible(v) },
    }
    const mockRenderer = {
        get visible() { return true },
        set visible(v: boolean) { setRendererVisible(v) },
    }

    const baseSceneMethods = {
        getCameraInfoJSON: vi.fn(() => opts.cameraInfoJSON ?? '[]'),
        getObject: vi.fn(() => mockObject),
        getRenderer: vi.fn(() => mockRenderer),
        startUndoTxn,
        commitUndoTxn,
        rollbackUndoTxn,
    }

    const mockScene = jsonOrScene === null
        ? null
        : typeof jsonOrScene === 'string'
            ? {
                getSceneDataJSON: vi.fn(() => jsonOrScene),
                ...baseSceneMethods,
            }
            : { ...(jsonOrScene as object), ...baseSceneMethods }

    const getScene = vi.fn(() => mockScene)
    const getStyleNamesJSON = vi.fn(() => opts.styleNamesJSON ?? '[]')
    const getService = vi.fn(() => ({ getStyleNamesJSON }))

    const ctx = {
        sceMgr: { getScene },
        svc: { getService },
    } as unknown as WorkerContext

    return {
        ctx, mockScene, getScene, getService, getStyleNamesJSON,
        setObjectVisible, setRendererVisible,
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }
}

describe('parseSceneTreeJSON', () => {
    it('returns null for malformed JSON', () => {
        expect(parseSceneTreeJSON('not json')).toBeNull()
    })

    it('returns null for empty array', () => {
        expect(parseSceneTreeJSON('[]')).toBeNull()
    })

    it('parses a minimal scene with no objects', () => {
        const json = JSON.stringify([
            { name: 'Scene1', type: '', ID: 1 },
        ])
        const tree = parseSceneTreeJSON(json)
        expect(tree).not.toBeNull()
        expect(tree?.type).toBe('scene')
        expect(tree?.id).toBe(1)
        expect(tree?.name).toBe('Scene1')
        expect(tree?.children).toHaveLength(0)
    })

    it('parses scene with objects and flat renderers', () => {
        const json = JSON.stringify([
            { name: 'Scene1', type: '', ID: 1 },
            {
                name: 'mol1', type: 'PDBMol', ID: 10,
                visible: true, locked: false,
                ui_collapsed: false, ui_order: 0,
                rends: [
                    { name: 'r1', type: 'cartoon', ID: 100, visible: true, locked: false, ui_order: 0 },
                    { name: 'r2', type: 'cpk', ID: 101, visible: false, locked: false, ui_order: 1 },
                ],
            },
        ])
        const tree = parseSceneTreeJSON(json)
        expect(tree?.children).toHaveLength(1)
        const obj = tree!.children[0]
        expect(obj.type).toBe('object')
        expect(obj.className).toBe('PDBMol')
        expect(obj.children).toHaveLength(2)
        expect(obj.children[0].type).toBe('renderer')
        expect(obj.children[0].className).toBe('cartoon')
        expect(obj.children[1].visible).toBe(false)
    })

    it('distinguishes rendGroup from renderer by childNodes presence', () => {
        const json = JSON.stringify([
            { name: 'Scene1', type: '', ID: 1 },
            {
                name: 'mol1', type: 'PDBMol', ID: 10, visible: true,
                rends: [
                    {
                        name: 'grp1', type: '*group', ID: 50,
                        visible: true, ui_collapsed: false,
                        childNodes: [
                            { name: 'child1', type: 'cartoon', ID: 200, visible: true },
                        ],
                    },
                    { name: 'r1', type: 'cpk', ID: 201, visible: true },
                ],
            },
        ])
        const tree = parseSceneTreeJSON(json)
        const obj = tree!.children[0]
        expect(obj.children[0].type).toBe('rendGroup')
        expect(obj.children[0].children).toHaveLength(1)
        expect(obj.children[0].children[0].type).toBe('renderer')
        expect(obj.children[1].type).toBe('renderer')
    })

    it('propagates effectiveVisible from invisible ancestor object', () => {
        const json = JSON.stringify([
            { name: 'Scene1', type: '', ID: 1 },
            {
                name: 'mol1', type: 'PDBMol', ID: 10, visible: false,
                rends: [
                    { name: 'r1', type: 'cartoon', ID: 100, visible: true },
                ],
            },
        ])
        const tree = parseSceneTreeJSON(json)
        const obj = tree!.children[0]
        expect(obj.visible).toBe(false)
        expect(obj.effectiveVisible).toBe(false)
        // own visible=true but ancestor invisible → effectiveVisible=false
        expect(obj.children[0].visible).toBe(true)
        expect(obj.children[0].effectiveVisible).toBe(false)
    })
})

describe('sceneTree service', () => {
    describe('getSceneTree', () => {
        it('returns ok:false and tree:null when scene lookup fails', () => {
            const { ctx, getScene } = makeCtx(null)
            const res = services.getSceneTree(ctx, { sceneId: 99 })
            expect(res).toEqual({ ok: false, tree: null })
            expect(getScene).toHaveBeenCalledWith(99)
        })

        it('returns parsed tree with synthesized cameraRoot/styleRoot when scene exists', () => {
            const json = JSON.stringify([
                { name: 'Scene1', type: '', ID: 1 },
                { name: 'mol1', type: 'PDBMol', ID: 10, visible: true, rends: [] },
            ])
            const { ctx } = makeCtx(json)
            const res = services.getSceneTree(ctx, { sceneId: 1 })
            expect(res.ok).toBe(true)
            expect(res.tree?.id).toBe(1)
            // 1 object + cameraRoot + styleRoot
            expect(res.tree?.children).toHaveLength(3)
            const types = res.tree?.children.map((c) => c.type)
            expect(types).toEqual(['object', 'cameraRoot', 'styleRoot'])
        })

        it('populates cameraRoot children from getCameraInfoJSON', () => {
            const json = JSON.stringify([{ name: 'Scene1', type: '', ID: 1 }])
            const cameraInfo = JSON.stringify([
                { name: 'cam0', vis_size: 0, src: '' },
                { name: 'cam1', vis_size: 1, src: 'foo.cam' },
            ])
            const { ctx } = makeCtx(json, { cameraInfoJSON: cameraInfo })
            const res = services.getSceneTree(ctx, { sceneId: 1 })
            const cameraRoot = res.tree?.children.find((c) => c.type === 'cameraRoot')
            expect(cameraRoot?.children).toHaveLength(2)
            expect(cameraRoot?.children.map((c) => c.name)).toEqual(['cam0', 'cam1'])
        })

        it('populates styleRoot children from StyleManager.getStyleNamesJSON', () => {
            const json = JSON.stringify([{ name: 'Scene1', type: '', ID: 1 }])
            const styleNames = JSON.stringify([
                { name: 'Default' },
                { name: 'BallStick' },
            ])
            const { ctx, getService } = makeCtx(json, { styleNamesJSON: styleNames })
            const res = services.getSceneTree(ctx, { sceneId: 1 })
            expect(getService).toHaveBeenCalledWith('StyleManager')
            const styleRoot = res.tree?.children.find((c) => c.type === 'styleRoot')
            expect(styleRoot?.children.map((c) => c.name)).toEqual(['Default', 'BallStick'])
        })

        it('tolerates camera/style API failures by returning empty roots', () => {
            const json = JSON.stringify([{ name: 'Scene1', type: '', ID: 1 }])
            const { ctx, mockScene } = makeCtx(json)
            ;(mockScene as { getCameraInfoJSON: ReturnType<typeof vi.fn> }).getCameraInfoJSON
                .mockImplementation(() => { throw new Error('boom') })
            const res = services.getSceneTree(ctx, { sceneId: 1 })
            expect(res.ok).toBe(true)
            const cameraRoot = res.tree?.children.find((c) => c.type === 'cameraRoot')
            expect(cameraRoot?.children).toHaveLength(0)
        })

        it('returns ok:false when JSON parse fails', () => {
            const { ctx } = makeCtx('not valid json')
            const res = services.getSceneTree(ctx, { sceneId: 1 })
            expect(res.ok).toBe(false)
            expect(res.tree).toBeNull()
        })
    })

    describe('setNodeVisible', () => {
        it('rejects scene nodes (no visibility flag)', () => {
            const { ctx, setObjectVisible } = makeCtx('[]')
            const res = services.setNodeVisible(ctx, {
                sceneId: 1, nodeId: 1, nodeType: 'scene', visible: false,
            })
            expect(res.ok).toBe(false)
            expect(setObjectVisible).not.toHaveBeenCalled()
        })

        it.each(['cameraRoot', 'styleRoot', 'camera', 'style'] as const)(
            'rejects %s nodes (no visibility flag)',
            (nodeType) => {
                const { ctx, setObjectVisible, setRendererVisible } = makeCtx('[]')
                const res = services.setNodeVisible(ctx, {
                    sceneId: 1, nodeId: -1, nodeType, visible: false,
                })
                expect(res.ok).toBe(false)
                expect(setObjectVisible).not.toHaveBeenCalled()
                expect(setRendererVisible).not.toHaveBeenCalled()
            },
        )

        it('sets object visibility wrapped in undo txn', () => {
            const { ctx, setObjectVisible, startUndoTxn, commitUndoTxn } = makeCtx('[]')
            const res = services.setNodeVisible(ctx, {
                sceneId: 1, nodeId: 10, nodeType: 'object', visible: false,
            })
            expect(res.ok).toBe(true)
            expect(startUndoTxn).toHaveBeenCalledWith('Hide')
            expect(setObjectVisible).toHaveBeenCalledWith(false)
            expect(commitUndoTxn).toHaveBeenCalled()
        })

        it('sets renderer visibility wrapped in undo txn', () => {
            const { ctx, setRendererVisible, startUndoTxn } = makeCtx('[]')
            const res = services.setNodeVisible(ctx, {
                sceneId: 1, nodeId: 100, nodeType: 'renderer', visible: true,
            })
            expect(res.ok).toBe(true)
            expect(startUndoTxn).toHaveBeenCalledWith('Show')
            expect(setRendererVisible).toHaveBeenCalledWith(true)
        })

        it('uses Scene.getRenderer (not getObject) for rendGroup', () => {
            const { ctx, mockScene, setRendererVisible } = makeCtx('[]')
            services.setNodeVisible(ctx, {
                sceneId: 1, nodeId: 50, nodeType: 'rendGroup', visible: false,
            })
            expect((mockScene as { getRenderer: ReturnType<typeof vi.fn> }).getRenderer)
                .toHaveBeenCalledWith(50)
            expect(setRendererVisible).toHaveBeenCalledWith(false)
        })

        it('rolls back undo txn on setter exception', () => {
            const { ctx, mockScene, startUndoTxn, commitUndoTxn, rollbackUndoTxn } = makeCtx('[]')
            const throwingObj = {
                get visible() { return true },
                set visible(_v: boolean) { throw new Error('assign failed') },
            }
            ;(mockScene as { getObject: ReturnType<typeof vi.fn> }).getObject =
                vi.fn(() => throwingObj)
            expect(() => services.setNodeVisible(ctx, {
                sceneId: 1, nodeId: 10, nodeType: 'object', visible: false,
            })).toThrow('assign failed')
            expect(startUndoTxn).toHaveBeenCalled()
            expect(rollbackUndoTxn).toHaveBeenCalled()
            expect(commitUndoTxn).not.toHaveBeenCalled()
        })
    })
})
