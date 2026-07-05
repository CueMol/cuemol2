/**
 * @file __test__/useRenderWindowClient.test.ts
 * @description Contract tests for the Rendering-window side of the relay:
 * mount subscribes to state pushes BEFORE requesting the sync (so the reply
 * cannot be missed), pushed context/result updates land in state, and the
 * command senders emit the right RENDER_WINDOW_COMMAND payloads.
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
import type { RenderWindowStateUpdate } from '../../shared/ipcTypes';
import type { RenderSettingsSnapshot } from '../data/renderResult';

const snapshot: RenderSettingsSnapshot = {
    backend: 'povray',
    commonProps: [],
    backendProps: [],
};

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
                canRender: true,
                sceneName: 'Scene1',
            });
        });
        expect(h.result.state.job?.progress).toBe(42);
        expect(h.result.state.canRender).toBe(true);
        expect(h.result.state.sceneName).toBe('Scene1');
        // A context update never clobbers the (separately pushed) result.
        expect(h.result.state.result).toBeNull();

        act(() => {
            harness.push({
                kind: 'result',
                result: {
                    id: 'r1', imageDataUrl: 'data:x', width: 8, height: 6,
                    elapsedSec: 1, sourceSceneId: 1, sourceSceneName: 'Scene1',
                    sourceViewId: 7,
                    settingsSnapshot: { backend: 'povray', commonProps: [], backendProps: [] },
                },
            });
        });
        expect(h.result.state.result?.id).toBe('r1');
        expect(h.result.state.job?.progress).toBe(42);
        h.unmount();
    });

    it('start / cancel / showSource send the matching commands', () => {
        const h = makeRenderHook(() => useRenderWindowClient());

        act(() => {
            h.result.start(snapshot, { sceneId: 1, sceneName: 'Scene1', viewId: 7 });
            h.result.cancel();
            h.result.showSource();
        });

        const cmds = harness.commands();
        // cmds[0] is the mount-time sync.
        expect(cmds[1]).toEqual({
            type: 'start',
            snapshot,
            source: { sceneId: 1, sceneName: 'Scene1', viewId: 7 },
        });
        expect(cmds[2]).toEqual({ type: 'cancel' });
        expect(cmds[3]).toEqual({ type: 'show-source' });
        h.unmount();
    });
});
