/**
 * @file __test__/useSceneContextMenu.test.tsx
 * @description What opening the scene-tree context menu does.
 *
 * The hook itself is now three steps -- build the payload, show the menu,
 * dispatch the command the picked action maps to -- so these pin the payload
 * it sends and the command it dispatches. What each command then does is
 * pinned by the handler tests; the mapping itself by
 * sceneCtxActionToCommand.test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useSceneContextMenu, type UseSceneContextMenuOptions } from '../hooks/useSceneContextMenu'
import { CmdId } from '../commands/ids'
import { IPC } from '@shared/ipcChannels'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

const dispatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../commands/CommandRegistry', () => ({ useCommands: () => ({ dispatch }) }))
// The hook calls useShowContextMenu() unconditionally; these tests drive the
// darwin (native IPC) path, so a no-op stub is enough (the React MenuPanel
// path is covered by contextMenuProvider.test.tsx).
vi.mock('../components/menu/ContextMenuProvider', () => ({
    useShowContextMenu: () => vi.fn().mockResolvedValue(null),
}))

function makeOpts(overrides: Partial<UseSceneContextMenuOptions> = {}): UseSceneContextMenuOptions {
    return { cm: { invokeService: vi.fn().mockResolvedValue({}) } as any, sceneId: 7, ...overrides }
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

/** Answer SCENE_CTX_SHOW with `action`, everything else with null. */
function menuReturns(action: unknown, onPayload?: (payload: any) => void) {
    const invoke = vi.fn((channel: string, payload: any) => {
        if (channel !== IPC.SCENE_CTX_SHOW) return Promise.resolve(null)
        onPayload?.(payload)
        return Promise.resolve(action)
    })
    ;(window as any).electronAPI = { platform: 'darwin', invoke }
    return invoke
}

beforeEach(() => {
    dispatch.mockClear()
    menuReturns(null)
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

describe('useSceneContextMenu', () => {
    it('dispatches the command the picked action maps to', async () => {
        menuReturns({ kind: 'show' })
        const h = mountHook(makeOpts())
        await act(async () => { await h.result.openContextMenu(objectNode(), 10, 20) })
        expect(dispatch).toHaveBeenCalledWith(CmdId.SceneNodeSetVisible, { ids: ['42'] })
        h.unmount()
    })

    it('carries the row it was raised on into the command arguments', async () => {
        menuReturns({ kind: 'paintRend', colorValue: '#00ff00' })
        const h = mountHook(makeOpts())
        await act(async () => { await h.result.openContextMenu(rendererNode(), 10, 20) })
        expect(dispatch).toHaveBeenCalledWith(CmdId.RendererPaint, { id: '100', colorValue: '#00ff00' })
        h.unmount()
    })

    it('a multi-select right-click sends the multi payload and acts on the selection', async () => {
        let seen: any
        menuReturns({ kind: 'multiHide' }, (payload) => { seen = payload })
        const selectedIds = new Set(['42', '43'])
        const h = mountHook(makeOpts({ selectedIds }))
        await act(async () => { await h.result.openContextMenu(objectNode(), 10, 20) })
        // The multi menu offers no per-row visibility and names the selection.
        expect(seen.hasVisibility).toBe(false)
        expect(seen.multiNodeIds).toEqual([42, 43])
        expect(dispatch).toHaveBeenCalledWith(
            CmdId.SceneNodeSetVisible, { ids: ['42', '43'], visible: false },
        )
        h.unmount()
    })

    it('dispatches nothing when the menu is dismissed', async () => {
        menuReturns(null)
        const h = mountHook(makeOpts())
        await act(async () => { await h.result.openContextMenu(objectNode(), 10, 20) })
        expect(dispatch).not.toHaveBeenCalled()
        h.unmount()
    })

    it('dispatches nothing for an action that does not apply to the row', async () => {
        // selectMol is an object-only entry; a renderer row must not act on it.
        menuReturns({ kind: 'selectMol', selectKind: 'all' })
        const h = mountHook(makeOpts())
        await act(async () => { await h.result.openContextMenu(rendererNode(), 10, 20) })
        expect(dispatch).not.toHaveBeenCalled()
        h.unmount()
    })
})
