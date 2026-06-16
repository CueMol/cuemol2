/**
 * @file __test__/useNaviClickHandler.test.tsx
 * @description Degrade-detection tests for useNaviClickHandler (T8 Tier 2a).
 * Pins the OBSERVABLE wire contract that T7 click-handler dedup will touch:
 *   - LBTN (1<<3) left-click branch -> cm.naviClickAtom,
 *   - RBTN (1<<5) right-click branch -> cm.naviHitTest + openContextMenu (only
 *     when the hit is a MolCoord),
 *   - mouseDoubleClicked LBTN branch -> cm.naviResidSel, with SHIFT (1<<0)
 *     selecting mode 'extend' vs 'toggle',
 *   - the srcMask (event.SEM_INDEV) the listeners subscribe with.
 *
 * Asserts wire form only (method name + payload + gating + callback), never
 * internal state / JSX. Dependency hooks are mocked so cm / activeViewID /
 * activeTool can be injected; useCueMolEventListener runs for real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import * as event from '../event';

void React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// CURRENT InDevEvent OUTPUT bits pinned as-is.
const LBTN = 1 << 3; // 8
const RBTN = 1 << 5; // 32
const SHIFT = 1 << 0; // 1

let injectedCm: unknown = null;
let injectedViewId: number | null = null;
let injectedTool = 'navigate';

vi.mock('../hooks/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: injectedCm != null, cm: injectedCm }),
}));
vi.mock('../hooks/useMolTab', () => ({
    useMolTabState: () => ({ activeViewID: injectedViewId }),
}));
vi.mock('../contexts/ActiveToolContext', () => ({
    useActiveToolContext: () => injectedTool,
}));

import { useNaviClickHandler } from '../hooks/useNaviClickHandler';

interface Subscription {
    category: string;
    srcMask: number;
    evtMask: number;
    scopeId: number;
    fire: (args: unknown) => void;
}

function makeCm(opts: {
    hitRaw?: unknown;
    clickAtomResult?: unknown;
    residSelResult?: unknown;
} = {}) {
    const subs: Subscription[] = [];
    let nextId = 1;
    const cm = {
        subs,
        naviHitTest: vi.fn(async (_payload: unknown) => ({
            hit: opts.hitRaw != null,
            raw: opts.hitRaw,
        })),
        naviClickAtom: vi.fn(async (_payload: unknown) => opts.clickAtomResult ?? { handled: true, statusMessage: 'atom' }),
        naviResidSel: vi.fn(async (_payload: unknown) => opts.residSelResult ?? { handled: true, objId: 5, atomId: 9 }),
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
let openContextMenu: ReturnType<typeof vi.fn>;

function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    openContextMenu = vi.fn();
    function TestComponent() {
        useNaviClickHandler({ setStatusMessage: () => {}, openContextMenu });
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
    injectedTool = 'navigate';
});

afterEach(() => {
    injectedCm = null;
});

describe('useNaviClickHandler -- wire contract', () => {
    it('subscribes mouseClicked + mouseDoubleClicked with srcMask SEM_INDEV', () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        const click = cm.subs.find((s) => s.category === 'mouseClicked');
        const dbl = cm.subs.find((s) => s.category === 'mouseDoubleClicked');
        expect(click).toBeDefined();
        expect(dbl).toBeDefined();
        expect(click!.srcMask).toBe(event.SEM_INDEV);
        expect(dbl!.srcMask).toBe(event.SEM_INDEV);
        expect(click!.scopeId).toBe(7);
        unmount();
    });

    it('LBTN click -> naviClickAtom { viewId, x, y } (no hit test / no context menu)', async () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        await fireFor(cm, 'mouseClicked', { obj: { x: 11, y: 22, mod: LBTN } });
        expect(cm.naviClickAtom).toHaveBeenCalledTimes(1);
        expect(cm.naviClickAtom.mock.calls[0][0]).toEqual({ viewId: 7, x: 11, y: 22 });
        expect(cm.naviHitTest).not.toHaveBeenCalled();
        expect(openContextMenu).not.toHaveBeenCalled();
        unmount();
    });

    it('RBTN click on a MolCoord hit -> naviHitTest + openContextMenu(raw, viewId)', async () => {
        const raw = { objtype: 'MolCoord', obj_id: 3 };
        const cm = makeCm({ hitRaw: raw });
        injectedCm = cm;
        mount();
        await fireFor(cm, 'mouseClicked', { obj: { x: 5, y: 6, mod: RBTN } });
        expect(cm.naviHitTest).toHaveBeenCalledTimes(1);
        expect(cm.naviHitTest.mock.calls[0][0]).toEqual({ viewId: 7, x: 5, y: 6 });
        expect(cm.naviClickAtom).not.toHaveBeenCalled();
        expect(openContextMenu).toHaveBeenCalledTimes(1);
        expect(openContextMenu.mock.calls[0]).toEqual([raw, 7]);
        unmount();
    });

    it('RBTN click on a non-MolCoord hit -> hit test fires but NO context menu', async () => {
        const cm = makeCm({ hitRaw: { objtype: 'SomethingElse' } });
        injectedCm = cm;
        mount();
        await fireFor(cm, 'mouseClicked', { obj: { x: 5, y: 6, mod: RBTN } });
        expect(cm.naviHitTest).toHaveBeenCalledTimes(1);
        expect(openContextMenu).not.toHaveBeenCalled();
        unmount();
    });

    it('click with neither LBTN nor RBTN -> no-op', async () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        await fireFor(cm, 'mouseClicked', { obj: { x: 1, y: 2, mod: 0 } });
        expect(cm.naviClickAtom).not.toHaveBeenCalled();
        expect(cm.naviHitTest).not.toHaveBeenCalled();
        unmount();
    });

    it('double-click LBTN without SHIFT -> naviResidSel mode "toggle"', async () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        await fireFor(cm, 'mouseDoubleClicked', { obj: { x: 4, y: 8, mod: LBTN } });
        expect(cm.naviResidSel).toHaveBeenCalledTimes(1);
        expect(cm.naviResidSel.mock.calls[0][0]).toMatchObject({
            viewId: 7,
            x: 4,
            y: 8,
            mode: 'toggle',
        });
        unmount();
    });

    it('double-click LBTN+SHIFT -> naviResidSel mode "extend"', async () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        await fireFor(cm, 'mouseDoubleClicked', { obj: { x: 4, y: 8, mod: LBTN | SHIFT } });
        expect(cm.naviResidSel).toHaveBeenCalledTimes(1);
        expect(cm.naviResidSel.mock.calls[0][0]).toMatchObject({ mode: 'extend' });
        unmount();
    });

    it('double-click WITHOUT LBTN -> no naviResidSel (no-op)', async () => {
        const cm = makeCm();
        injectedCm = cm;
        mount();
        await fireFor(cm, 'mouseDoubleClicked', { obj: { x: 4, y: 8, mod: 0 } });
        expect(cm.naviResidSel).not.toHaveBeenCalled();
        unmount();
    });
});
