/**
 * @file __test__/useInspectorState.test.ts
 * @description Contract tests for the inspector-state hook: the worker
 * service calls it issues, View-property targeting, and the per-scene
 * memory that keeps the inspector in sync across content-tab switches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushPromises } from './helpers/testHarness';
import { useInspectorState } from '../hooks/useInspectorState';
import type { SceneTreeNode } from '../worker/shared/sceneTreeTypes';
import type { LayoutState } from '../hooks/useLayoutPersistence';

// Minimal scene tree: scene(uid `sceneId`) -> renderer(uid `rendId`).
function makeTree(sceneId: number, rendId: number): SceneTreeNode {
    const renderer = {
        id: rendId, name: 'ribbon1', type: 'renderer', className: 'ribbon',
        visible: true, locked: false, uiCollapsed: false, uiOrder: 0,
        effectiveVisible: true, children: [],
    } as unknown as SceneTreeNode;
    return {
        id: sceneId, name: `scene${sceneId}`, type: 'scene', className: '',
        visible: true, locked: false, uiCollapsed: false, uiOrder: 0,
        effectiveVisible: true, children: [renderer],
    } as unknown as SceneTreeNode;
}

function makeCm() {
    return {
        invokeService: vi.fn((name: string) => {
            if (name === 'getGenericProps') {
                return Promise.resolve({
                    ok: true, entries: [], displayName: 'ribbon1', typeLabel: 'ribbon',
                });
            }
            return Promise.resolve({ ok: true, entries: [] });
        }),
        addEventListener: vi.fn().mockResolvedValue(1),
        removeEventListener: vi.fn().mockResolvedValue(undefined),
    };
}

const LAYOUT = { inspectorOpen: false } as unknown as LayoutState;

/**
 * Mount the hook inside a probe that owns `sceneTree` as React state, so a
 * test can simulate a content-tab (scene) switch via `setSceneTree` - this
 * forces a real prop change (which `makeRenderHook` cannot do).
 */
interface HookHandle {
    readonly result: ReturnType<typeof useInspectorState>;
    setSceneTree(tree: SceneTreeNode): Promise<void>;
    /** Simulate closing the last molview tab: tree gone, no active scene. */
    closeScene(): Promise<void>;
    unmount(): void;
}

function mountHook(cm: unknown, initialTree: SceneTreeNode): HookHandle {
    let result!: ReturnType<typeof useInspectorState>;
    let setTree!: (t: SceneTreeNode | null) => void;

    const Probe: React.FC = () => {
        const [tree, setTreeState] = useState<SceneTreeNode | null>(initialTree);
        setTree = setTreeState;
        result = useInspectorState({
            layout: LAYOUT,
            loaded: true,
            persistInspectorOpen: vi.fn(),
            cm: cm as never,
            sceneTree: tree,
            // Authoritative active scene tracks the tree's scene in production;
            // undefined once no molview tab is open (scene closed).
            activeSceneId: tree ? Number(tree.id) : undefined,
        });
        return null;
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    let root!: Root;
    act(() => {
        root = createRoot(container);
        root.render(React.createElement(Probe));
    });

    return {
        get result() {
            return result;
        },
        async setSceneTree(tree: SceneTreeNode) {
            await act(async () => {
                setTree(tree);
                await flushPromises();
            });
        },
        async closeScene() {
            await act(async () => {
                setTree(null);
                await flushPromises();
            });
        },
        unmount() {
            act(() => root.unmount());
            container.remove();
        },
    };
}

async function settle(): Promise<void> {
    await act(async () => {
        await flushPromises();
    });
}

describe('useInspectorState', () => {
    let cm: ReturnType<typeof makeCm>;

    beforeEach(() => {
        cm = makeCm();
    });

    it('handleShowGeneric fetches props for the resolved node', async () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowGeneric('5');
        });
        await settle();
        expect(cm.invokeService).toHaveBeenCalledWith('getGenericProps', {
            sceneId: 1, nodeId: 5, nodeType: 'renderer',
        });
        expect(h.result.inspectorOpen).toBe(true);
        h.unmount();
    });

    it('does not invoke the worker for an unresolvable node id', () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowGeneric('999');
        });
        expect(cm.invokeService).not.toHaveBeenCalled();
        expect(h.result.inspectorOpen).toBe(false);
        h.unmount();
    });

    it('handleGenericSet sends a setGenericProp op:set call', async () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowGeneric('5');
        });
        await settle();
        cm.invokeService.mockClear();
        await act(async () => {
            await h.result.handleGenericSet('alpha', 'real', 0.5);
        });
        expect(cm.invokeService).toHaveBeenCalledWith('setGenericProp', {
            sceneId: 1, nodeId: 5, nodeType: 'renderer',
            propName: 'alpha', op: 'set', valueType: 'real', value: 0.5,
        });
        h.unmount();
    });

    it('handleGenericReset sends a setGenericProp op:reset call', async () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowGeneric('5');
        });
        await settle();
        cm.invokeService.mockClear();
        await act(async () => {
            await h.result.handleGenericReset('alpha');
        });
        expect(cm.invokeService).toHaveBeenCalledWith('setGenericProp', {
            sceneId: 1, nodeId: 5, nodeType: 'renderer',
            propName: 'alpha', op: 'reset', valueType: '',
        });
        h.unmount();
    });

    it('handleResetMany sends one resetGenericProps call with all keys', async () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowGeneric('5');
        });
        await settle();
        cm.invokeService.mockClear();
        await act(async () => {
            await h.result.handleResetMany(['alpha', 'visible']);
        });
        expect(cm.invokeService).toHaveBeenCalledTimes(1);
        expect(cm.invokeService).toHaveBeenCalledWith('resetGenericProps', {
            sceneId: 1, nodeId: 5, nodeType: 'renderer',
            propNames: ['alpha', 'visible'],
        });
        h.unmount();
    });

    it('handleResetMany is a no-op for an empty key list', async () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowGeneric('5');
        });
        await settle();
        cm.invokeService.mockClear();
        await act(async () => {
            await h.result.handleResetMany([]);
        });
        expect(cm.invokeService).not.toHaveBeenCalled();
        h.unmount();
    });

    it('handleShowViewProps targets the active View by view id', async () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowViewProps(42);
        });
        await settle();
        expect(h.result.inspectorTarget).toEqual({
            kind: 'node', sceneId: 1, nodeId: 42, nodeType: 'view',
        });
        expect(cm.invokeService).toHaveBeenCalledWith('getGenericProps', {
            sceneId: 1, nodeId: 42, nodeType: 'view',
        });
        h.unmount();
    });

    it('remembers the inspected target per scene across tab switches', async () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowGeneric('5');
        });
        await settle();
        expect(h.result.inspectorTarget).toMatchObject({ sceneId: 1, nodeId: 5 });

        // Switch to scene 2 (never inspected) -> target clears.
        await h.setSceneTree(makeTree(2, 9));
        expect(h.result.inspectorTarget).toBeNull();

        // Switch back to scene 1 -> its remembered target is restored.
        await h.setSceneTree(makeTree(1, 5));
        expect(h.result.inspectorTarget).toMatchObject({
            sceneId: 1, nodeId: 5, nodeType: 'renderer',
        });
        h.unmount();
    });

    it('clears the inspected target when the active scene closes', async () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowGeneric('5');
        });
        await settle();
        expect(h.result.inspectorTarget).toMatchObject({ sceneId: 1, nodeId: 5 });

        // Close the last molview tab: activeSceneId becomes undefined, so the
        // inspector must drop its target (no editing a closed scene) and blank
        // the generic state.
        await h.closeScene();
        expect(h.result.inspectorTarget).toBeNull();
        expect(h.result.genericEntries).toEqual([]);
        expect(h.result.inspectorInfo).toEqual({ name: '', type: '' });
        h.unmount();
    });

    it('per-scene memory restores a View target too', async () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowViewProps(42);
        });
        await settle();

        await h.setSceneTree(makeTree(2, 9));
        expect(h.result.inspectorTarget).toBeNull();

        await h.setSceneTree(makeTree(1, 5));
        expect(h.result.inspectorTarget).toEqual({
            kind: 'node', sceneId: 1, nodeId: 42, nodeType: 'view',
        });
        h.unmount();
    });

    it('handleShowRenderSettings targets render settings without a worker call', async () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowRenderSettings();
        });
        await settle();
        expect(h.result.inspectorTarget).toEqual({
            kind: 'renderSettings', sceneId: 1,
        });
        expect(h.result.inspectorOpen).toBe(true);
        expect(h.result.inspectorCategory).toBe('Render Settings');
        // Render Settings is not backed by the C++ property bridge.
        expect(cm.invokeService).not.toHaveBeenCalled();
        h.unmount();
    });

    it('per-scene memory restores a render-settings target too', async () => {
        const h = mountHook(cm, makeTree(1, 5));
        act(() => {
            h.result.handleShowRenderSettings();
        });
        await settle();

        await h.setSceneTree(makeTree(2, 9));
        expect(h.result.inspectorTarget).toBeNull();

        await h.setSceneTree(makeTree(1, 5));
        expect(h.result.inspectorTarget).toEqual({
            kind: 'renderSettings', sceneId: 1,
        });
        h.unmount();
    });
});

describe('useInspectorState - animElement target', () => {
    it('handleShowAnimElement sets an animElement target (Animation) without a generic fetch', async () => {
        const cm = makeCm();
        const h = mountHook(cm, makeTree(1, 5));
        act(() => h.result.handleShowAnimElement(1, 42));
        await flushPromises();
        expect(h.result.inspectorTarget).toEqual({ kind: 'animElement', sceneId: 1, uid: 42 });
        expect(h.result.inspectorCategory).toBe('Animation');
        // Self-fetching branch: the hook must not call getGenericProps for anim.
        const calls = (cm.invokeService as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.every((c: unknown[]) => c[0] !== 'getGenericProps')).toBe(true);
        h.unmount();
    });

    it('handleClearAnimElement(scene) leaves a coexisting node target untouched', async () => {
        const cm = makeCm();
        const h = mountHook(cm, makeTree(1, 5));
        act(() => h.result.handleShowGeneric('5')); // node target (renderer uid 5)
        await flushPromises();
        expect(h.result.inspectorTarget?.kind).toBe('node');
        act(() => h.result.handleClearAnimElement(1)); // stale anim clear, same scene
        expect(h.result.inspectorTarget?.kind).toBe('node');
        h.unmount();
    });
});
