/**
 * @file __test__/useBondEditClickHandler.test.tsx
 * @description Degrade-detection tests for useBondEditClickHandler (T8 Tier 2a).
 * Pins the OBSERVABLE wire contract that T7 click-handler dedup will touch:
 *   - LBTN (1<<3) gating of mouseClicked picks -> invokeService('bondEditPick',
 *     { viewId, x, y }),
 *   - the reset path -> invokeService('bondEditReset', { viewId }) on cleanup
 *     and on Escape,
 *   - the srcMask (event.SEM_INDEV) the listener subscribes with.
 *
 * Asserts wire form only. Dependency hooks are mocked so cm / activeViewID /
 * activeTool can be injected; useCueMolEventListener runs for real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import * as event from '../event';

void React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// CURRENT InDevEvent OUTPUT bit pinned as-is.
const LBTN = 1 << 3; // 8

let injectedCm: unknown = null;
let injectedViewId: number | null = null;
let injectedTool = 'bondEdit';

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: injectedCm != null, cm: injectedCm }),
}));
vi.mock('../state/workspace', () => ({
    // The active view as the workspace reports it (undefined = no molview).
    useActiveScene: () => ({
        activeMolViewId: injectedViewId ?? undefined,
        activeSceneId: undefined,
        hasScene: injectedViewId != null,
    }),
}));
vi.mock('../contexts/ActiveToolContext', () => ({
    useActiveToolContext: () => injectedTool,
}));

import { useBondEditClickHandler } from '../hooks/useBondEditClickHandler';

interface Subscription {
    category: string;
    srcMask: number;
    evtMask: number;
    scopeId: number;
    fire: (args: unknown) => void;
}

function makeCm(pickResult: unknown = { statusMessage: 'picked' }) {
    const subs: Subscription[] = [];
    let nextId = 1;
    const cm = {
        subs,
        invokeService: vi.fn(async (_name: string, _args: unknown) => {
            if (_name === 'bondEditPick') return pickResult;
            return { cleared: false };
        }),
        addEventListener: vi.fn(
            async (category: string, srcMask: number, evtMask: number, scopeId: number, fire: (a: unknown) => void) => {
                subs.push({ category, srcMask, evtMask, scopeId, fire });
                return nextId++;
            },
        ),
        removeEventListener: vi.fn(async () => {}),
    };
    return cm;
}

function fireFor(cm: ReturnType<typeof makeCm>, category: string, payload: unknown) {
    const sub = cm.subs.find((s) => s.category === category);
    if (!sub) throw new Error(`no subscription for category ${category}`);
    return act(async () => {
        sub.fire(payload);
        await Promise.resolve();
        await Promise.resolve();
    });
}

let root!: Root;
let container!: HTMLDivElement;

function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    function TestComponent() {
        useBondEditClickHandler({ setStatusMessage: () => {} });
        return null;
    }
    act(() => {
        root = createRoot(container);
        root.render(React.createElement(TestComponent));
    });
}

function unmount() {
    act(() => {
        root.unmount();
    });
    document.body.removeChild(container);
}

beforeEach(() => {
    injectedViewId = 7;
    injectedTool = 'bondEdit';
});

afterEach(() => {
    injectedCm = null;
});

describe('useBondEditClickHandler -- wire contract', () => {
    it('subscribes mouseClicked with srcMask SEM_INDEV scoped to the active view', () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        const sub = cm.subs.find((s) => s.category === 'mouseClicked');
        expect(sub).toBeDefined();
        expect(sub!.srcMask).toBe(event.SEM_INDEV);
        expect(sub!.scopeId).toBe(7);
        unmount();
    });

    it('LBTN-set click -> bondEditPick fires with exact payload { viewId, x, y }', async () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        await fireFor(cm, 'mouseClicked', { obj: { x: 15, y: 25, mod: LBTN } });
        const calls = cm.invokeService.mock.calls.filter((c) => c[0] === 'bondEditPick');
        expect(calls).toHaveLength(1);
        expect(calls[0][1]).toEqual({ viewId: 7, x: 15, y: 25 });
        unmount();
    });

    it('click WITHOUT the LBTN bit -> no bondEditPick (no-op)', async () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        await fireFor(cm, 'mouseClicked', { obj: { x: 1, y: 2, mod: 0 } });
        expect(cm.invokeService.mock.calls.filter((c) => c[0] === 'bondEditPick')).toHaveLength(0);
        unmount();
    });

    it('reset path: leaving the tool (cleanup) -> bondEditReset { viewId }', () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        unmount();
        const resets = cm.invokeService.mock.calls.filter((c) => c[0] === 'bondEditReset');
        expect(resets).toHaveLength(1);
        expect(resets[0][1]).toEqual({ viewId: 7 });
    });

    it('Escape while active -> bondEditReset { viewId }', async () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            await Promise.resolve();
        });
        const resets = cm.invokeService.mock.calls.filter((c) => c[0] === 'bondEditReset');
        expect(resets.length).toBeGreaterThanOrEqual(1);
        expect(resets[0][1]).toEqual({ viewId: 7 });
        unmount();
    });
});
