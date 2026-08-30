/**
 * Regression test for the scene-tree stale-fetch race (B4).
 *
 * Switching tabs A -> B quickly used to leave A's tree on screen: the
 * getSceneTree fetch for A was still in flight and resolved after B's,
 * overwriting the newer state. The hook now runs its fetch through
 * useLiveFetch, whose stale-fetch guard drops A's late result.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useSceneTree } from '@renderer/features/scene/useSceneTree'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import { setupElectronAPI, teardownElectronAPI } from '@renderer/__test__/helpers/testHarness'

void React
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

const treeFor = (sceneId: number): SceneTreeNode => ({
    id: sceneId, name: `scene${sceneId}`, type: 'scene', className: '', visible: true,
    locked: false, uiCollapsed: false, uiOrder: 0, effectiveVisible: true, children: [],
})

interface Deferred { resolve: (tree: SceneTreeNode) => void }

/** cm whose getSceneTree stays pending until the test resolves it per scene. */
function makeCm() {
    const pending = new Map<number, Deferred>()
    const invokeService = vi.fn((channel: string, args: { sceneId: number }) => {
        if (channel !== 'getSceneTree') return Promise.resolve({ ok: true })
        return new Promise((resolve) => {
            pending.set(args.sceneId, { resolve: (tree) => resolve({ tree }) })
        })
    })
    return {
        pending,
        invokeService,
        addEventListener: vi.fn().mockResolvedValue(1),
        removeEventListener: vi.fn().mockResolvedValue(undefined),
    }
}

function mountHook(cm: any, sceneId: number) {
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
        switchTo(next: number) {
            curScene = next
            act(() => { root.render(React.createElement(Probe)) })
        },
        unmount() {
            act(() => { root.unmount() })
            document.body.removeChild(container)
        },
    }
}

const settle = async (): Promise<void> => {
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

beforeEach(() => { setupElectronAPI() })
afterEach(() => { vi.clearAllMocks(); teardownElectronAPI() })

describe('useSceneTree stale fetch', () => {
    it('keeps the newer scene tree when the older fetch resolves late', async () => {
        const cm = makeCm()
        const h = mountHook(cm, 7)
        await settle()
        h.switchTo(8)
        await settle()
        expect(cm.pending.has(7)).toBe(true)
        expect(cm.pending.has(8)).toBe(true)

        cm.pending.get(8)!.resolve(treeFor(8))
        await settle()
        expect(h.result.tree?.id).toBe(8)

        // Scene 7's fetch comes back after the switch: it must be ignored.
        cm.pending.get(7)!.resolve(treeFor(7))
        await settle()
        expect(h.result.tree?.id).toBe(8)
        h.unmount()
    })
})
