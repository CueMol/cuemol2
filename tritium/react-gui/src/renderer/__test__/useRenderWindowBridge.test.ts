/**
 * @file __test__/useRenderWindowBridge.test.ts
 * @description Contract tests for the main-window side of the Rendering-window
 * relay: forwarded commands drive the render job (renderStart / renderCancel /
 * tab switch), job and target-view state are pushed via RENDER_WINDOW_STATE,
 * and the view-size round trip replies with the canvas pixel size.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import {
    makeRenderHook,
    setupElectronAPI,
    teardownElectronAPI,
    flushPromises,
} from './helpers/testHarness';
import { useRenderWindowBridge } from '../hooks/useRenderWindowBridge';
import { IPC } from '../../shared/ipcChannels';
import type {
    RenderTargetViewWire,
    RenderWindowStateUpdate,
} from '../../shared/ipcTypes';
import type { RenderUpdate, RenderStartResult } from '../worker/shared/renderTypes';
import { DEFAULT_RENDER_BINARIES } from '../worker/shared/renderTypes';
import type { RenderSettingsSnapshot } from '../data/renderResult';
import type { TabData } from '../types';

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }));
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }));

const snapshot: RenderSettingsSnapshot = {
    mode: 'still',
    backend: 'povray',
    commonProps: [],
    backendProps: [],
};

const molviewTab: TabData = {
    id: 'molview-1',
    title: 'Scene1:0',
    icon: 'file.molview',
    type: 'molview',
    viewId: 7,
};

const views: RenderTargetViewWire[] = [
    { viewId: 7, sceneId: 1, sceneName: 'Scene1', title: 'Scene1:0' },
];

/** Fake AsyncCueMol exposing an `emit` to push render-progress updates. */
function makeCm(startResult: RenderStartResult = { ok: true, jobId: 'job-1' }) {
    let listener: ((u: RenderUpdate) => void) | null = null;
    const cm = {
        subscribeRenderProgress: vi.fn((cb: (u: RenderUpdate) => void) => {
            listener = cb;
            return () => { listener = null; };
        }),
        invokeService: vi.fn((name: string) => {
            if (name === 'renderStart') return Promise.resolve(startResult);
            if (name === 'renderCancel') return Promise.resolve({ ok: true });
            return Promise.resolve(undefined);
        }),
    };
    return { cm, emit: (u: RenderUpdate) => listener?.(u) };
}

/** electronAPI mock capturing per-channel push callbacks and invoke calls. */
function setupApi() {
    const pushCbs = new Map<string, (payload: unknown) => void>();
    const api = setupElectronAPI({
        onPush: vi.fn((channel: string, cb: (payload: unknown) => void) => {
            pushCbs.set(channel, cb);
            return () => pushCbs.delete(channel);
        }),
    });
    return {
        api,
        exec: (cmd: unknown) => pushCbs.get(IPC.RENDER_WINDOW_EXEC)?.(cmd),
        requestViewSize: (reqId: number) =>
            pushCbs.get(IPC.RENDER_VIEW_SIZE_REQUEST)?.({ reqId }),
        stateUpdates: () =>
            (api.invoke as ReturnType<typeof vi.fn>).mock.calls
                .filter((c) => c[0] === IPC.RENDER_WINDOW_STATE)
                .map((c) => c[1] as RenderWindowStateUpdate),
    };
}

function mountBridge(cm: unknown, setActiveTab = vi.fn()) {
    const h = makeRenderHook(() =>
        useRenderWindowBridge({
            cm: cm as never,
            views,
            activeViewId: 7,
            tabs: [molviewTab],
            setActiveTab,
            binaries: DEFAULT_RENDER_BINARIES,
            umbreonAvailable: true,
        }),
    );
    return h;
}

let harness: ReturnType<typeof setupApi>;

beforeEach(() => {
    harness = setupApi();
});

afterEach(() => {
    teardownElectronAPI();
});

describe('useRenderWindowBridge', () => {
    it('EXEC start uses the explicit source sent by the render window', async () => {
        const { cm } = makeCm();
        const h = mountBridge(cm);

        await act(async () => {
            harness.exec({
                type: 'start',
                snapshot,
                source: { sceneId: 3, sceneName: 'Other', viewId: 9 },
            });
            await flushPromises();
        });

        expect(cm.invokeService).toHaveBeenCalledWith('renderStart', {
            sceneId: 3,
            viewId: 9,
            snapshot,
            binaries: DEFAULT_RENDER_BINARIES,
        });
        h.unmount();
    });

    it('EXEC start without a source falls back to the active view', async () => {
        const { cm } = makeCm();
        const h = mountBridge(cm);

        await act(async () => {
            harness.exec({ type: 'start', snapshot });
            await flushPromises();
        });

        expect(cm.invokeService).toHaveBeenCalledWith('renderStart', {
            sceneId: 1,
            viewId: 7,
            snapshot,
            binaries: DEFAULT_RENDER_BINARIES,
        });
        h.unmount();
    });

    it('pushes a context update when the job changes and a result on completion', async () => {
        const { cm, emit } = makeCm();
        const h = mountBridge(cm);

        await act(async () => {
            harness.exec({ type: 'start', snapshot });
            await flushPromises();
        });
        act(() => emit({
            type: 'complete', jobId: 'job-1',
            imagePath: '/tmp/render/out.png', width: 800, height: 600, elapsedSec: 3.5,
        }));
        await flushPromises();

        const updates = harness.stateUpdates();
        const context = updates.filter((u) => u.kind === 'context');
        const results = updates.filter((u) => u.kind === 'history');
        // At least: initial context, job-started context, job-done context.
        expect(context.length).toBeGreaterThanOrEqual(2);
        expect(context[context.length - 1]).toMatchObject({
            views,
            activeViewId: 7,
            umbreonAvailable: true,
        });
        // The finished render is announced once, as a history push carrying
        // metadata only -- the image went to the on-disk archive.
        expect(results.length).toBe(1);
        expect((results[0] as { entries: unknown[] }).entries).toHaveLength(1);
        expect(JSON.stringify(results[0])).not.toContain('data:image');
        // ... which the main process was asked to store first.
        expect(harness.api.invoke).toHaveBeenCalledWith(
            IPC.RENDER_HISTORY_STORE,
            expect.objectContaining({ sourcePath: '/tmp/render/out.png' }),
        );
        h.unmount();
    });

    it('EXEC sync re-pushes both the context and the render history', async () => {
        const { cm, emit } = makeCm();
        const h = mountBridge(cm);
        await act(async () => {
            harness.exec({ type: 'start', snapshot });
            await flushPromises();
        });
        act(() => emit({
            type: 'complete', jobId: 'job-1',
            imagePath: '/tmp/a.png', width: 8, height: 6, elapsedSec: 1,
        }));
        await flushPromises();
        const before = harness.stateUpdates().length;

        act(() => { harness.exec({ type: 'sync' }); });

        const after = harness.stateUpdates();
        expect(after.length).toBe(before + 2);
        expect(after[after.length - 2].kind).toBe('context');
        expect(after[after.length - 1]).toMatchObject({ kind: 'history' });
        expect(
            (after[after.length - 1] as { entries: unknown[] }).entries,
        ).toHaveLength(1);
        h.unmount();
    });

    it('EXEC show-source activates the source molview tab of the latest result', async () => {
        const { cm, emit } = makeCm();
        const setActiveTab = vi.fn();
        const h = mountBridge(cm, setActiveTab);
        await act(async () => {
            harness.exec({ type: 'start', snapshot });
            await flushPromises();
        });
        act(() => emit({
            type: 'complete', jobId: 'job-1',
            imagePath: '/tmp/a.png', width: 8, height: 6, elapsedSec: 1,
        }));
        await flushPromises();

        act(() => { harness.exec({ type: 'show-source' }); });

        expect(setActiveTab).toHaveBeenCalledWith('molview-1');
        h.unmount();
    });

    it('EXEC cancel calls renderCancel on the active job', async () => {
        const { cm } = makeCm();
        const h = mountBridge(cm);
        await act(async () => {
            harness.exec({ type: 'start', snapshot });
            await flushPromises();
        });

        await act(async () => {
            harness.exec({ type: 'cancel' });
            await flushPromises();
        });

        expect(cm.invokeService).toHaveBeenCalledWith('renderCancel', { jobId: 'job-1' });
        h.unmount();
    });

    it('VIEW_SIZE_REQUEST replies with the canvas pixel size', async () => {
        const { cm } = makeCm();
        const canvas = document.createElement('canvas');
        canvas.getBoundingClientRect = () =>
            ({ width: 400, height: 300 } as DOMRect);
        document.body.appendChild(canvas);
        const h = mountBridge(cm);

        await act(async () => {
            harness.requestViewSize(11);
            await flushPromises();
        });

        expect(harness.api.invoke).toHaveBeenCalledWith(IPC.RENDER_VIEW_SIZE_REPLY, {
            reqId: 11,
            size: { width: 400, height: 300 },
        });
        h.unmount();
        document.body.removeChild(canvas);
    });
});
