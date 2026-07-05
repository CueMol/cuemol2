/**
 * @file __test__/useRenderWindowClient.test.ts
 * @description Contract tests for the Rendering-window side of the relay:
 * mount subscribes to state pushes BEFORE requesting the sync (so the reply
 * cannot be missed), pushed context/result updates land in state, the target
 * selection auto-follows the main window's ACTIVE-VIEW CHANGES while an
 * explicit pick sticks between them, and the command senders emit the right
 * RENDER_WINDOW_COMMAND payloads (start carries the selected target).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import {
    makeRenderHook,
    setupElectronAPI,
    teardownElectronAPI,
} from './helpers/testHarness';
import { useRenderWindowClient } from '../hooks/useRenderWindowClient';
import { IPC } from '../../shared/ipcChannels';
import type {
    RenderTargetViewWire,
    RenderWindowStateUpdate,
} from '../../shared/ipcTypes';
import type { RenderSettingsSnapshot } from '../data/renderResult';

const snapshot: RenderSettingsSnapshot = {
    backend: 'povray',
    commonProps: [],
    backendProps: [],
};

const viewA: RenderTargetViewWire = {
    viewId: 7, sceneId: 1, sceneName: 'SceneA', title: 'SceneA:0',
};
const viewB: RenderTargetViewWire = {
    viewId: 9, sceneId: 2, sceneName: 'SceneB', title: 'SceneB:0',
};

/** Context push with the given targets and active view (no job). */
const context = (
    views: RenderTargetViewWire[],
    activeViewId: number | null,
): RenderWindowStateUpdate => ({ kind: 'context', job: null, views, activeViewId });

/** electronAPI mock recording subscription order and command invokes. */
function setupApi() {
    const events: string[] = [];
    let pushCb: ((u: RenderWindowStateUpdate) => void) | null = null;
    const api = setupElectronAPI({
        onPush: vi.fn((channel: string, cb: (u: RenderWindowStateUpdate) => void) => {
            events.push(`subscribe:${channel}`);
            if (channel === IPC.RENDER_WINDOW_STATE_PUSH) pushCb = cb;
            return () => { pushCb = null; };
        }),
        invoke: vi.fn((channel: string) => {
            events.push(`invoke:${channel}`);
            return Promise.resolve(undefined);
        }),
    });
    return {
        api,
        events,
        push: (u: RenderWindowStateUpdate) => pushCb?.(u),
        commands: () =>
            (api.invoke as ReturnType<typeof vi.fn>).mock.calls
                .filter((c) => c[0] === IPC.RENDER_WINDOW_COMMAND)
                .map((c) => c[1]),
    };
}

let harness: ReturnType<typeof setupApi>;

beforeEach(() => {
    harness = setupApi();
});

afterEach(() => {
    teardownElectronAPI();
});

describe('useRenderWindowClient', () => {
    it('subscribes to state pushes before sending the sync command', () => {
        const h = makeRenderHook(() => useRenderWindowClient());

        const subIdx = harness.events.indexOf(
            `subscribe:${IPC.RENDER_WINDOW_STATE_PUSH}`,
        );
        const syncIdx = harness.events.indexOf(
            `invoke:${IPC.RENDER_WINDOW_COMMAND}`,
        );
        expect(subIdx).toBeGreaterThanOrEqual(0);
        expect(syncIdx).toBeGreaterThan(subIdx);
        expect(harness.commands()[0]).toEqual({ type: 'sync' });
        h.unmount();
    });

    it('applies pushed context and result updates to state', () => {
        const h = makeRenderHook(() => useRenderWindowClient());

        act(() => {
            harness.push({
                kind: 'context',
                job: {
                    jobId: 'j1', status: 'running', progress: 42, phase: 'running',
                    log: ['x'], startedAt: 0,
                },
                views: [viewA],
                activeViewId: 7,
            });
        });
        expect(h.result.state.job?.progress).toBe(42);
        expect(h.result.state.views).toEqual([viewA]);
        expect(h.result.state.activeViewId).toBe(7);
        // A context update never clobbers the (separately pushed) result.
        expect(h.result.state.result).toBeNull();

        act(() => {
            harness.push({
                kind: 'result',
                result: {
                    id: 'r1', imageDataUrl: 'data:x', width: 8, height: 6,
                    elapsedSec: 1, sourceSceneId: 1, sourceSceneName: 'SceneA',
                    sourceViewId: 7,
                    settingsSnapshot: { backend: 'povray', commonProps: [], backendProps: [] },
                },
            });
        });
        expect(h.result.state.result?.id).toBe('r1');
        expect(h.result.state.job?.progress).toBe(42);
        h.unmount();
    });

    it('target auto-follows active-view changes; an explicit pick sticks between them', () => {
        const h = makeRenderHook(() => useRenderWindowClient());

        // Initial sync: target follows the active view.
        act(() => harness.push(context([viewA, viewB], 7)));
        expect(h.result.targetViewId).toBe(7);

        // Explicit pick of the non-active view.
        act(() => h.result.setTargetViewId(9));
        expect(h.result.targetViewId).toBe(9);
        expect(h.result.target).toEqual(viewB);

        // Re-push with the SAME active view (progress tick): pick sticks.
        act(() => harness.push(context([viewA, viewB], 7)));
        expect(h.result.targetViewId).toBe(9);

        // The main window's active view CHANGES: target auto-follows.
        act(() => harness.push(context([viewA, viewB], 9)));
        expect(h.result.targetViewId).toBe(9);
        act(() => harness.push(context([viewA, viewB], 7)));
        expect(h.result.targetViewId).toBe(7);
        h.unmount();
    });

    it('a selection whose view was closed falls back to the active view', () => {
        const h = makeRenderHook(() => useRenderWindowClient());
        act(() => harness.push(context([viewA, viewB], 7)));
        act(() => h.result.setTargetViewId(9));

        // viewB closed while viewA stays active (same activeViewId).
        act(() => harness.push(context([viewA], 7)));

        expect(h.result.targetViewId).toBe(7);
        expect(h.result.target).toEqual(viewA);
        h.unmount();
    });

    it('start carries the selected target as the source', () => {
        const h = makeRenderHook(() => useRenderWindowClient());
        act(() => harness.push(context([viewA, viewB], 7)));
        act(() => h.result.setTargetViewId(9));

        act(() => {
            h.result.start(snapshot);
            h.result.cancel();
            h.result.showSource();
        });

        const cmds = harness.commands();
        // cmds[0] is the mount-time sync.
        expect(cmds[1]).toEqual({
            type: 'start',
            snapshot,
            source: { sceneId: 2, sceneName: 'SceneB', viewId: 9 },
        });
        expect(cmds[2]).toEqual({ type: 'cancel' });
        expect(cmds[3]).toEqual({ type: 'show-source' });
        h.unmount();
    });

    it('start with an explicit source (re-render) overrides the selection', () => {
        const h = makeRenderHook(() => useRenderWindowClient());
        act(() => harness.push(context([viewA, viewB], 7)));

        act(() => {
            h.result.start(snapshot, { sceneId: 5, sceneName: 'Old', viewId: 3 });
        });

        expect(harness.commands()[1]).toEqual({
            type: 'start',
            snapshot,
            source: { sceneId: 5, sceneName: 'Old', viewId: 3 },
        });
        h.unmount();
    });
});
