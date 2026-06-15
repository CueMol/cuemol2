/**
 * Degrade-detection test for hooks/useSceneTree.ts.
 *
 * Refactor target: the 1000-line hook is being split into per-domain
 * sub-hooks under hooks/sceneTree/. These tests pin the *observable wire
 * contract* (which `cm.invokeService` channel each action callback hits,
 * the payload shape, and the return-value mapping) so the split can swap
 * the internals while this file keeps passing unchanged.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useSceneTree } from '../hooks/useSceneTree'
import type { SceneTreeNode } from '../worker/shared/sceneTreeTypes'
import {
    SEM_SCENE,
    SEM_OBJECT,
    SEM_RENDERER,
    SEM_CAMERA,
    SEM_STYLE,
} from '../event'

void React

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

// ── Mock scene tree ──────────────────────────────────────────────────
//   scene 0
//   ├── object 42 "mol1"
//   │   ├── renderer 100 "simple1"
//   │   └── rendGroup 200 "group1"
//   │        └── renderer 201 "child1"
//   ├── camera 900 "cam1"
//   └── style  910 "style1" (scopeId 5)

const node = (o: Partial<SceneTreeNode>): SceneTreeNode => ({
    id: 0, name: '', type: 'object', className: '', visible: true,
    locked: false, uiCollapsed: false, uiOrder: 0, effectiveVisible: true,
    children: [], ...o,
})

const MOCK_TREE: SceneTreeNode = node({
    id: 0, name: 'scene', type: 'scene', children: [
        node({
            id: 42, name: 'mol1', type: 'object', className: 'MolCoord', children: [
                node({ id: 100, name: 'simple1', type: 'renderer', className: 'simple' }),
                node({
                    id: 200, name: 'group1', type: 'rendGroup', className: '*group',
                    children: [node({ id: 201, name: 'child1', type: 'renderer' })],
                }),
            ],
        }),
        node({ id: 900, name: 'cam1', type: 'camera' }),
        node({
            id: 910, name: 'style1', type: 'style',
            styleInfo: { scopeId: 5, src: '', readonly: false, modified: false },
        }),
    ],
})

const objectNode = (): SceneTreeNode => MOCK_TREE.children[0]
const cameraNode = (): SceneTreeNode => MOCK_TREE.children[1]
const styleNode = (): SceneTreeNode => MOCK_TREE.children[2]

// ── Mock cm ──────────────────────────────────────────────────────────

function makeCm(overrides: Record<string, unknown> = {}): any {
    const invokeService = vi.fn((channel: string) => {
        switch (channel) {
            case 'getSceneTree':
                return Promise.resolve({ tree: MOCK_TREE })
            case 'createStyleSet':
                return Promise.resolve({ ok: true, newId: 99 })
            case 'toggleStyleSetReadOnly':
                return Promise.resolve({ ok: true, readonly: true })
            case 'saveStyleSetToCurrentSrc':
            case 'saveCameraToCurrentSrc':
                return Promise.resolve({ ok: true, saved: true })
            default:
                return Promise.resolve({ ok: true })
        }
    })
    return {
        invokeService,
        addEventListener: vi.fn().mockResolvedValue(1),
        removeEventListener: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    }
}

const SCENE_ID = 7

// ── Mount helper ─────────────────────────────────────────────────────

function mountHook(cm: any, sceneId: number | undefined = SCENE_ID): {
    result: ReturnType<typeof useSceneTree>
    rerender: (nextSceneId?: number) => void
    unmount: () => void
} {
    let result!: ReturnType<typeof useSceneTree>
    let curScene = sceneId
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    const Probe: React.FC = () => {
        result = useSceneTree({ cm, sceneId: curScene })
        return null
    }
    act(() => {
        root = createRoot(container)
        root.render(React.createElement(Probe))
    })
    return {
        get result() { return result },
        rerender(nextSceneId?: number) {
            if (nextSceneId !== undefined) curScene = nextSceneId
            act(() => { root.render(React.createElement(Probe)) })
        },
        unmount() {
            act(() => { root.unmount() })
            document.body.removeChild(container)
        },
    }
}

/** Mount and wait for the initial getSceneTree refetch to settle. */
async function mountReady(cm: any): Promise<ReturnType<typeof mountHook>> {
    const h = mountHook(cm)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    return h
}

afterEach(() => { vi.clearAllMocks() })

// ── Fetch / subscribe ────────────────────────────────────────────────

describe('useSceneTree — fetch & subscribe', () => {
    it('fetches the tree on mount via getSceneTree', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        expect(cm.invokeService).toHaveBeenCalledWith('getSceneTree', { sceneId: SCENE_ID })
        expect(h.result.tree).toEqual(MOCK_TREE)
        h.unmount()
    })

    it('refetches when sceneId changes', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        cm.invokeService.mockClear()
        h.rerender(8)
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        expect(cm.invokeService).toHaveBeenCalledWith('getSceneTree', { sceneId: 8 })
        h.unmount()
    })

    it('subscribes to the CueMol event manager with the scene-event mask', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        const mask = SEM_SCENE | SEM_OBJECT | SEM_RENDERER | SEM_CAMERA | SEM_STYLE
        expect(cm.addEventListener).toHaveBeenCalled()
        const [category, srcMask, , scopeId] = cm.addEventListener.mock.calls[0]
        expect(category).toBe('')
        expect(srcMask).toBe(mask)
        expect(scopeId).toBe(SCENE_ID)
        h.unmount()
    })
})

// ── Action callback wire contracts ───────────────────────────────────

interface WireCase {
    name: string
    run: (r: ReturnType<typeof useSceneTree>) => Promise<unknown>
    channel: string
    payload: Record<string, unknown>
}

const WIRE_CASES: WireCase[] = [
    {
        name: 'toggleVisibility',
        run: (r) => { r.toggleVisibility('42'); return Promise.resolve() },
        channel: 'setNodeVisible',
        payload: { sceneId: SCENE_ID, nodeId: 42, nodeType: 'object', visible: false },
    },
    {
        name: 'focusNode',
        run: (r) => r.focusNode(5, '42'),
        channel: 'focusOnNode',
        payload: { sceneId: SCENE_ID, viewId: 5, nodeId: 42, nodeType: 'object' },
    },
    {
        name: 'deleteNode (renderer)',
        run: (r) => r.deleteNode('100'),
        channel: 'deleteNode',
        payload: { sceneId: SCENE_ID, nodeId: 100, nodeType: 'renderer' },
    },
    {
        name: 'deleteNode (rendGroup carries childIds)',
        run: (r) => r.deleteNode('200'),
        channel: 'deleteNode',
        payload: { sceneId: SCENE_ID, nodeId: 200, nodeType: 'rendGroup', childIds: [201] },
    },
    {
        name: 'deleteNode (camera routes to destroyCamera)',
        run: (r) => r.deleteNode('900'),
        channel: 'destroyCamera',
        payload: { sceneId: SCENE_ID, name: 'cam1' },
    },
    {
        name: 'renameNode',
        run: (r) => r.renameNode('42', 'newName'),
        channel: 'renameNode',
        payload: { sceneId: SCENE_ID, nodeId: 42, nodeType: 'object', newName: 'newName' },
    },
    {
        name: 'selectObjectMol',
        run: (r) => r.selectObjectMol('42', 'select' as any),
        channel: 'selectObjectMol',
        payload: { sceneId: SCENE_ID, objId: 42, kind: 'select' },
    },
    {
        name: 'copyNode (object)',
        run: (r) => r.copyNode(objectNode()),
        channel: 'copyNode',
        payload: { sceneId: SCENE_ID, nodeId: 42, nodeType: 'object' },
    },
    {
        name: 'copyNode (style carries scopeId)',
        run: (r) => r.copyNode(styleNode()),
        channel: 'copyNode',
        payload: { sceneId: SCENE_ID, nodeId: 910, nodeType: 'style', scopeId: 5 },
    },
    {
        name: 'copyNode (camera carries cameraName)',
        run: (r) => r.copyNode(cameraNode()),
        channel: 'copyNode',
        payload: { sceneId: SCENE_ID, nodeId: 900, nodeType: 'camera', cameraName: 'cam1' },
    },
    {
        name: 'pasteNode (object target)',
        run: (r) => r.pasteNode(objectNode()),
        channel: 'pasteNode',
        payload: { sceneId: SCENE_ID, targetObjId: 42 },
    },
    {
        name: 'setRendererColoring',
        run: (r) => r.setRendererColoring('100', 'CPK' as any),
        channel: 'setRendererColoring',
        payload: { sceneId: SCENE_ID, rendId: 100, coloringId: 'CPK' },
    },
    {
        name: 'paintRendererSelection',
        run: (r) => r.paintRendererSelection('100', '#ff0000'),
        channel: 'paintRendererSelection',
        payload: { sceneId: SCENE_ID, rendId: 100, colorValue: '#ff0000' },
    },
    {
        name: 'paintObjectSelection',
        run: (r) => r.paintObjectSelection('42', '#00ff00'),
        channel: 'paintObjectSelection',
        payload: { sceneId: SCENE_ID, objId: 42, colorValue: '#00ff00' },
    },
    {
        name: 'applyRendererStyle',
        run: (r) => r.applyRendererStyle('100', 'styleN', 'pat', 'flg'),
        channel: 'applyRendererStyle',
        payload: { sceneId: SCENE_ID, rendId: 100, styleName: 'styleN', pattern: 'pat', flags: 'flg' },
    },
    {
        name: 'setRendererSelection',
        run: (r) => r.setRendererSelection('100', 'all' as any),
        channel: 'setRendererSelection',
        payload: { sceneId: SCENE_ID, rendId: 100, selKind: 'all' },
    },
    {
        name: 'generateRendererSurfObj',
        run: (r) => r.generateRendererSurfObj('100'),
        channel: 'generateRendererSurfObj',
        payload: { sceneId: SCENE_ID, rendId: 100 },
    },
    {
        name: 'createRendererGroup',
        run: (r) => r.createRendererGroup('42', 'grp'),
        channel: 'createRendererGroup',
        payload: { sceneId: SCENE_ID, objId: 42, name: 'grp' },
    },
    {
        name: 'changeRendererType',
        run: (r) => r.changeRendererType('100', 'cartoon'),
        channel: 'changeRendererType',
        payload: { sceneId: SCENE_ID, rendId: 100, newType: 'cartoon' },
    },
    {
        name: 'createRendererOnObject',
        run: (r) => r.createRendererOnObject(42, { type: 'simple' } as any, 'grp'),
        channel: 'createRendererOnObject',
        payload: { sceneId: SCENE_ID, objId: 42, rendOpts: { type: 'simple' }, groupName: 'grp' },
    },
    {
        name: 'moveSceneNode',
        run: (r) => r.moveSceneNode({ kind: 'object', sourceId: 1, targetId: 2, ori: 1 }),
        channel: 'reorderSceneNode',
        payload: { kind: 'object', sourceId: 1, targetId: 2, ori: 1, sceneId: SCENE_ID },
    },
    {
        name: 'bulkSetNodeVisible',
        run: (r) => r.bulkSetNodeVisible(['42'], true),
        channel: 'bulkSetNodeVisible',
        payload: {
            sceneId: SCENE_ID, visible: true,
            items: [{ nodeId: 42, nodeType: 'object' }],
        },
    },
    {
        name: 'bulkDeleteNodes',
        run: (r) => r.bulkDeleteNodes(['200']),
        channel: 'bulkDeleteNode',
        payload: {
            sceneId: SCENE_ID,
            items: [{ nodeId: 200, nodeType: 'rendGroup', childIds: [201] }],
        },
    },
    {
        name: 'setSceneBackgroundColor',
        run: (r) => r.setSceneBackgroundColor('white'),
        channel: 'setSceneBgColor',
        payload: { sceneId: SCENE_ID, colorName: 'white' },
    },
    {
        name: 'toggleSceneColorProofing',
        run: (r) => r.toggleSceneColorProofing(),
        channel: 'toggleSceneColorProofing',
        payload: { sceneId: SCENE_ID },
    },
    {
        name: 'createStyleSet',
        run: (r) => r.createStyleSet('myStyle'),
        channel: 'createStyleSet',
        payload: { sceneId: SCENE_ID, name: 'myStyle' },
    },
    {
        name: 'toggleStyleSetReadOnly',
        run: (r) => r.toggleStyleSetReadOnly(3, 5),
        channel: 'toggleStyleSetReadOnly',
        payload: { sceneId: SCENE_ID, scopeId: 5, styleSetId: 3 },
    },
    {
        name: 'loadStyleSetFromFile',
        run: (r) => r.loadStyleSetFromFile('/p'),
        channel: 'loadStyleSetFromFile',
        payload: { sceneId: SCENE_ID, path: '/p' },
    },
    {
        name: 'saveStyleSetToFile',
        run: (r) => r.saveStyleSetToFile(3, 5, '/p'),
        channel: 'saveStyleSetToFile',
        payload: { sceneId: SCENE_ID, scopeId: 5, styleSetId: 3, path: '/p' },
    },
    {
        name: 'saveStyleSetToCurrentSrc',
        run: (r) => r.saveStyleSetToCurrentSrc(3, 5),
        channel: 'saveStyleSetToCurrentSrc',
        payload: { sceneId: SCENE_ID, scopeId: 5, styleSetId: 3 },
    },
    {
        name: 'createCamera',
        run: (r) => r.createCamera(5, 'cam'),
        channel: 'createCamera',
        payload: { sceneId: SCENE_ID, viewId: 5, name: 'cam' },
    },
    {
        name: 'renameCamera',
        run: (r) => r.renameCamera('old', 'new'),
        channel: 'renameCamera',
        payload: { sceneId: SCENE_ID, oldName: 'old', newName: 'new' },
    },
    {
        name: 'saveViewToCamera',
        run: (r) => r.saveViewToCamera(5, 'cam', true),
        channel: 'saveViewToCamera',
        payload: { sceneId: SCENE_ID, viewId: 5, name: 'cam', withVisFlags: true },
    },
    {
        name: 'applyCameraToView',
        run: (r) => r.applyCameraToView(5, 'cam', false),
        channel: 'applyCameraToView',
        payload: { sceneId: SCENE_ID, viewId: 5, name: 'cam', withVisFlags: false },
    },
    {
        name: 'clearCameraVisFlags',
        run: (r) => r.clearCameraVisFlags('cam'),
        channel: 'clearCameraVisFlags',
        payload: { sceneId: SCENE_ID, name: 'cam' },
    },
    {
        name: 'loadCameraFromFile',
        run: (r) => r.loadCameraFromFile(5, '/p'),
        channel: 'loadCameraFromFile',
        payload: { sceneId: SCENE_ID, viewId: 5, path: '/p' },
    },
    {
        name: 'saveCameraToFile',
        run: (r) => r.saveCameraToFile('cam', '/p'),
        channel: 'saveCameraToFile',
        payload: { sceneId: SCENE_ID, name: 'cam', path: '/p' },
    },
    {
        name: 'saveCameraToCurrentSrc',
        run: (r) => r.saveCameraToCurrentSrc('cam'),
        channel: 'saveCameraToCurrentSrc',
        payload: { sceneId: SCENE_ID, name: 'cam' },
    },
    {
        name: 'reloadCameraFromSrc',
        run: (r) => r.reloadCameraFromSrc('cam'),
        channel: 'reloadCameraFromSrc',
        payload: { sceneId: SCENE_ID, name: 'cam' },
    },
]

describe('useSceneTree — action callback wire contracts', () => {
    for (const tc of WIRE_CASES) {
        it(`${tc.name} routes to invokeService('${tc.channel}', ...)`, async () => {
            const cm = makeCm()
            const h = await mountReady(cm)
            cm.invokeService.mockClear()
            await act(async () => { await tc.run(h.result) })
            const call = cm.invokeService.mock.calls.find(
                (c: unknown[]) => c[0] === tc.channel,
            )
            expect(call, `expected an invokeService('${tc.channel}') call`).toBeTruthy()
            expect(call[1]).toEqual(tc.payload)
            h.unmount()
        })
    }
})

// ── Return-value mapping ─────────────────────────────────────────────

describe('useSceneTree — return-value mapping', () => {
    it('boolean callbacks resolve to res.ok', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        let ok: unknown
        await act(async () => { ok = await h.result.focusNode(5, '42') })
        expect(ok).toBe(true)
        h.unmount()
    })

    it('createStyleSet maps { ok, newId }', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        let res: unknown
        await act(async () => { res = await h.result.createStyleSet('s') })
        expect(res).toEqual({ ok: true, newId: 99 })
        h.unmount()
    })

    it('saveCameraToCurrentSrc maps { ok, saved }', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        let res: unknown
        await act(async () => { res = await h.result.saveCameraToCurrentSrc('cam') })
        expect(res).toEqual({ ok: true, saved: true })
        h.unmount()
    })

    it('resolveNodeName looks up the node name from the tree', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        expect(h.result.resolveNodeName('42')).toBe('mol1')
        expect(h.result.resolveNodeName('999')).toBe('999')
        h.unmount()
    })
})

// ── Selection state ──────────────────────────────────────────────────

describe('useSceneTree — selection state', () => {
    it('setSelectedId sets the primary id and a singleton set', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        act(() => { h.result.setSelectedId('42') })
        expect(h.result.selectedId).toBe('42')
        expect(h.result.selectedIds).toEqual(new Set(['42']))
        h.unmount()
    })

    it('setSelectedId("") clears the selection', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        act(() => { h.result.setSelectedId('42') })
        act(() => { h.result.setSelectedId('') })
        expect(h.result.selectedId).toBe('')
        expect(h.result.selectedIds.size).toBe(0)
        h.unmount()
    })

    it('toggleInSelection extends and removes set membership', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        act(() => { h.result.setSelectedId('42') })
        act(() => { h.result.toggleInSelection('100') })
        expect(h.result.selectedIds).toEqual(new Set(['42', '100']))
        act(() => { h.result.toggleInSelection('100') })
        expect(h.result.selectedIds).toEqual(new Set(['42']))
        h.unmount()
    })

    it('selectedHasOps reflects the selected node type', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        act(() => { h.result.setSelectedId('42') })
        // object: focus / delete / property / add all enabled
        expect(h.result.selectedHasOps).toEqual({
            focus: true, delete: true, property: true, add: true,
        })
        h.unmount()
    })

    it('multi-select disables focus/property but keeps delete', async () => {
        const cm = makeCm()
        const h = await mountReady(cm)
        act(() => { h.result.setSelectedId('42') })
        act(() => { h.result.toggleInSelection('100') })
        expect(h.result.selectedHasOps.focus).toBe(false)
        expect(h.result.selectedHasOps.property).toBe(false)
        expect(h.result.selectedHasOps.delete).toBe(true)
        h.unmount()
    })
})
