/**
 * @file __test__/useMeasureClickHandler.test.tsx
 * @description Degrade-detection tests for useMeasureClickHandler (T8 Tier 2a).
 * Pins the OBSERVABLE wire contract that T7 click-handler dedup will touch:
 *   - the LBTN (1<<3) gating of mouseClicked picks,
 *   - the exact `measurePick` payload shape,
 *   - the `measureReset` reset path (cleanup on disable / Escape),
 *   - the srcMask (event.SEM_INDEV) the listener subscribes with.
 *
 * Asserts wire form only (service name + payload + gating + call order),
 * never internal React state or JSX. The three dependency hooks are mocked so
 * cm / activeViewID / activeTool can be injected; useCueMolEventListener runs
 * for real, so `cm.addEventListener` receives the live `fire` handler that we
 * capture and drive with synthetic mouseClicked events.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import * as event from '../event';

void React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// CURRENT bit constants pinned as-is (InDevEvent OUTPUT bits, NOT the DOM
// makeModif layer in inputEvents.ts). A refactor that rederives them wrong
// must turn the gating tests below red.
const LBTN = 1 << 3; // 8

// --- Injectable dependency state ---
let injectedCm: unknown = null;
let injectedViewId: number | null = null;
let injectedTool = 'distance';

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

import { useMeasureClickHandler } from '../hooks/useMeasureClickHandler';

// --- Fake cm capturing addEventListener subscriptions + service calls ---
interface Subscription {
    category: string;
    srcMask: number;
    evtMask: number;
    scopeId: number;
    fire: (args: unknown) => void;
}

function makeCm(measurePickResult: unknown = { handled: true, statusMessage: 'ok' }) {
    const subs: Subscription[] = [];
    let nextId = 1;
    const cm = {
        subs,
        invokeService: vi.fn(async (_name: string, _args: unknown) => {
            if (_name === 'measurePick') return measurePickResult;
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
        useMeasureClickHandler({ setStatusMessage: () => {}, target: '' });
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
    injectedTool = 'distance';
});

afterEach(() => {
    injectedCm = null;
});

describe('useMeasureClickHandler -- wire contract', () => {
    it('subscribes to mouseClicked with srcMask SEM_INDEV scoped to the active view', () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        const sub = cm.subs.find((s) => s.category === 'mouseClicked');
        expect(sub).toBeDefined();
        expect(sub!.srcMask).toBe(event.SEM_INDEV);
        expect(sub!.scopeId).toBe(7);
        unmount();
    });

    it('LBTN-set click -> measurePick fires with exact payload', async () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        await fireFor(cm, 'mouseClicked', { obj: { x: 12, y: 34, mod: LBTN } });
        const calls = cm.invokeService.mock.calls.filter((c) => c[0] === 'measurePick');
        expect(calls).toHaveLength(1);
        expect(calls[0][1]).toEqual({ viewId: 7, x: 12, y: 34, mode: 'distance', target: '' });
        unmount();
    });

    it('click WITHOUT the LBTN bit -> no measurePick (no-op)', async () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        // mod=0 has neither LBTN nor any other button bit set.
        await fireFor(cm, 'mouseClicked', { obj: { x: 1, y: 2, mod: 0 } });
        expect(cm.invokeService.mock.calls.filter((c) => c[0] === 'measurePick')).toHaveLength(0);
        unmount();
    });

    it('reset path: leaving the tool (cleanup) -> measureReset fires with { viewId }', () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        // Unmount runs the effect cleanups (enabled was true) -> measureReset.
        unmount();
        const resets = cm.invokeService.mock.calls.filter((c) => c[0] === 'measureReset');
        expect(resets).toHaveLength(1);
        expect(resets[0][1]).toEqual({ viewId: 7 });
    });

    it('Escape while active -> measureReset fires with { viewId }', async () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        await act(async () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            await Promise.resolve();
        });
        const resets = cm.invokeService.mock.calls.filter((c) => c[0] === 'measureReset');
        expect(resets.length).toBeGreaterThanOrEqual(1);
        expect(resets[0][1]).toEqual({ viewId: 7 });
        unmount();
    });
});
