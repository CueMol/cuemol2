/**
 * Pins the dispatch contract of useSceneContextMenu's right-click flow.
 * Refactor target: the 800-line hook is being split into a buildSceneCtxPayload
 * pre-fetch and a dispatchSceneCtxAction switch — these tests survive the
 * extraction unchanged because they assert the public dispatch behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useSceneContextMenu, type UseSceneContextMenuOptions } from '../hooks/useSceneContextMenu'
import { IPC } from '../../shared/ipcChannels'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

vi.mock('../components/dialogs/TextPromptDialogProvider', () => ({
    useShowTextPromptDialog: () => vi.fn().mockResolvedValue('typed-name'),
}))
vi.mock('../components/dialogs/NewRendererDialogProvider', () => ({
    useShowNewRendererDialog: () => vi.fn().mockResolvedValue(null),
}))
vi.mock('../components/dialogs/ApplyRendStyleDialogProvider', () => ({
    useShowApplyRendStyleDialog: () => vi.fn().mockResolvedValue(null),
}))
vi.mock('../components/dialogs/CreateRendStyleDialogProvider', () => ({
    useShowCreateRendStyleDialog: () => vi.fn().mockResolvedValue(null),
}))

function makeMockCm() {
    return {
        invokeService: vi.fn().mockResolvedValue({}),
    } as any
}

function makeOpts(overrides: Partial<UseSceneContextMenuOptions> = {}): UseSceneContextMenuOptions {
    return {
        cm: makeMockCm(),
        sceneId: 7,
        toggleVisibility: vi.fn(),
        deleteNode: vi.fn().mockResolvedValue(true),
        renameNode: vi.fn().mockResolvedValue(true),
        showProperty: vi.fn(),
        selectObjectMol: vi.fn().mockResolvedValue(true),
        beginInlineRename: vi.fn(),
        copyNode: vi.fn().mockResolvedValue(true),
        pasteNode: vi.fn().mockResolvedValue(true),
        setRendererColoring: vi.fn().mockResolvedValue(true),
        paintRendererSelection: vi.fn().mockResolvedValue(true),
        paintObjectSelection: vi.fn().mockResolvedValue(true),
        applyRendererStyle: vi.fn().mockResolvedValue(true),
        setSceneBackgroundColor: vi.fn().mockResolvedValue(true),
        toggleSceneColorProofing: vi.fn().mockResolvedValue(true),
        setRendererSelection: vi.fn().mockResolvedValue(true),
        generateRendererSurfObj: vi.fn().mockResolvedValue(true),
        createRendererGroup: vi.fn().mockResolvedValue(true),
        changeRendererType: vi.fn().mockResolvedValue(true),
        createRendererOnObject: vi.fn().mockResolvedValue(true),
        bulkSetNodeVisible: vi.fn().mockResolvedValue(true),
        bulkDeleteNodes: vi.fn().mockResolvedValue(true),
        createStyleSet: vi.fn().mockResolvedValue({ ok: true, newId: 1 }),
        toggleStyleSetReadOnly: vi.fn().mockResolvedValue({ ok: true, readonly: true }),
        loadStyleSetFromFile: vi.fn().mockResolvedValue(true),
        saveStyleSetToFile: vi.fn().mockResolvedValue(true),
        saveStyleSetToCurrentSrc: vi.fn().mockResolvedValue({ ok: true, saved: true }),
        activeViewId: 5,
        createCamera: vi.fn().mockResolvedValue(true),
        renameCamera: vi.fn().mockResolvedValue(true),
        saveViewToCamera: vi.fn().mockResolvedValue(true),
        applyCameraToView: vi.fn().mockResolvedValue(true),
        clearCameraVisFlags: vi.fn().mockResolvedValue(true),
        loadCameraFromFile: vi.fn().mockResolvedValue(true),
        saveCameraToFile: vi.fn().mockResolvedValue(true),
        saveCameraToCurrentSrc: vi.fn().mockResolvedValue({ ok: true, saved: true }),
        reloadCameraFromSrc: vi.fn().mockResolvedValue(true),
        ...overrides,
    }
}

function mountHook(opts: UseSceneContextMenuOptions): {
    result: ReturnType<typeof useSceneContextMenu>
    unmount: () => void
} {
    let result!: ReturnType<typeof useSceneContextMenu>
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    const Probe: React.FC = () => {
        result = useSceneContextMenu(opts)
        return null
    }
    act(() => {
        root = createRoot(container)
        root.render(React.createElement(Probe))
    })
    return {
        get result() { return result },
        unmount() {
            act(() => { root.unmount() })
            document.body.removeChild(container)
        },
    }
}

let invokeMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    invokeMock = vi.fn().mockResolvedValue(null)
    ;(window as any).electronAPI = { invoke: invokeMock }
})

afterEach(() => { vi.clearAllMocks() })

const objectNode = (overrides: Record<string, unknown> = {}): any => ({
    id: 42, type: 'object', name: 'mol1', className: 'MolCoord', visible: true,
    children: [], ...overrides,
})

const rendererNode = (overrides: Record<string, unknown> = {}): any => ({
    id: 100, type: 'renderer', name: 'simple1', className: 'simple', visible: true,
    children: [], ...overrides,
})

describe('useSceneContextMenu — dispatch contracts', () => {
    it('routes show action to toggleVisibility', async () => {
        invokeMock = vi.fn((channel: string) =>
            channel === IPC.SCENE_CTX_SHOW
                ? Promise.resolve({ kind: 'show' })
                : Promise.resolve(null),
        )
        ;(window as any).electronAPI = { invoke: invokeMock }
        const opts = makeOpts()
        const h = mountHook(opts)
        await act(async () => { await h.result.openContextMenu(objectNode(), 10, 20) })
        expect(opts.toggleVisibility).toHaveBeenCalledWith('42')
        h.unmount()
    })

    it('routes paintRend action on object node to paintObjectSelection (UXP onPaintMol object branch)', async () => {
        invokeMock = vi.fn((channel: string) =>
            channel === IPC.SCENE_CTX_SHOW
                ? Promise.resolve({ kind: 'paintRend', colorValue: '#ff0000' })
                : Promise.resolve(null),
        )
        ;(window as any).electronAPI = { invoke: invokeMock }
        const opts = makeOpts()
        const h = mountHook(opts)
        await act(async () => { await h.result.openContextMenu(objectNode(), 10, 20) })
        expect(opts.paintObjectSelection).toHaveBeenCalledWith('42', '#ff0000')
        expect(opts.paintRendererSelection).not.toHaveBeenCalled()
        h.unmount()
    })

    it('routes paintRend action on renderer node to paintRendererSelection', async () => {
        invokeMock = vi.fn((channel: string) =>
            channel === IPC.SCENE_CTX_SHOW
                ? Promise.resolve({ kind: 'paintRend', colorValue: '#00ff00' })
                : Promise.resolve(null),
        )
        ;(window as any).electronAPI = { invoke: invokeMock }
        const opts = makeOpts()
        const h = mountHook(opts)
        await act(async () => { await h.result.openContextMenu(rendererNode(), 10, 20) })
        expect(opts.paintRendererSelection).toHaveBeenCalledWith('100', '#00ff00')
        expect(opts.paintObjectSelection).not.toHaveBeenCalled()
        h.unmount()
    })

    it('multi-select right-click skips per-type pre-fetch and routes multi actions', async () => {
        invokeMock = vi.fn((channel: string, payload: any) => {
            if (channel === IPC.SCENE_CTX_SHOW) {
                // Pin the multi payload contract: hasVisibility=false and
                // multiNodeIds carries the selection.
                expect(payload.hasVisibility).toBe(false)
                expect(payload.multiNodeIds).toEqual([42, 43])
                return Promise.resolve({ kind: 'multiHide' })
            }
            return Promise.resolve(null)
        })
        ;(window as any).electronAPI = { invoke: invokeMock }
        const selectedIds = new Set(['42', '43'])
        const opts = makeOpts({ selectedIds })
        const h = mountHook(opts)
        await act(async () => { await h.result.openContextMenu(objectNode(), 10, 20) })
        expect(opts.bulkSetNodeVisible).toHaveBeenCalledWith(selectedIds, false)
        h.unmount()
    })

    it('returns early without dispatching when the menu is dismissed (action=null)', async () => {
        invokeMock = vi.fn().mockResolvedValue(null)
        ;(window as any).electronAPI = { invoke: invokeMock }
        const opts = makeOpts()
        const h = mountHook(opts)
        await act(async () => { await h.result.openContextMenu(objectNode(), 10, 20) })
        expect(opts.toggleVisibility).not.toHaveBeenCalled()
        expect(opts.deleteNode).not.toHaveBeenCalled()
        h.unmount()
    })
})
