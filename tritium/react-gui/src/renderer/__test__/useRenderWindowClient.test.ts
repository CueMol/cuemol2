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
import { IPC } from '@shared/ipcChannels';
import type { RenderTargetViewWire, RenderWindowModeRequest, RenderWindowStateUpdate } from '@shared/types/renderWindow';
import type { RenderSettingsSnapshot } from '../data/renderResult';

const snapshot: RenderSettingsSnapshot = {
    mode: 'still',
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
): RenderWindowStateUpdate => ({
    kind: 'context',
    job: null,
    views,
    activeViewId,
    umbreonAvailable: false,
});

/** electronAPI mock recording subscription order and command invokes. */
function setupApi() {
    const events: string[] = [];
    let pushCb: ((u: RenderWindowStateUpdate) => void) | null = null;
    let modeCb: ((r: RenderWindowModeRequest) => void) | null = null;
    const api = setupElectronAPI({
        onPush: vi.fn((channel: string, cb: (u: never) => void) => {
            events.push(`subscribe:${channel}`);
            if (channel === IPC.RENDER_WINDOW_STATE_PUSH) {
                pushCb = cb as (u: RenderWindowStateUpdate) => void;
            }
            if (channel === IPC.RENDER_WINDOW_MODE_PUSH) {
                modeCb = cb as (r: RenderWindowModeRequest) => void;
            }
            return () => { pushCb = null; modeCb = null; };
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
        pushMode: (r: RenderWindowModeRequest) => modeCb?.(r),
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

    it('subscribes to the mode push before the sync and mirrors the request', () => {
        // Main holds a mode requested while this window was still loading and
        // releases it on the sync, so the subscription must come first.
        const h = makeRenderHook(() => useRenderWindowClient());

        const subIdx = harness.events.indexOf(
            `subscribe:${IPC.RENDER_WINDOW_MODE_PUSH}`,
        );
        const syncIdx = harness.events.indexOf(
            `invoke:${IPC.RENDER_WINDOW_COMMAND}`,
        );
        expect(subIdx).toBeGreaterThanOrEqual(0);
        expect(syncIdx).toBeGreaterThan(subIdx);
        expect(h.result.state.modeRequest).toBeNull();

        act(() => { harness.pushMode({ mode: 'movie', seq: 1 }); });
        expect(h.result.state.modeRequest).toEqual({ mode: 'movie', seq: 1 });

        // Same mode requested again: the seq makes it a distinct object, so
        // the consumer re-applies it even though the mode did not change.
        act(() => { harness.pushMode({ mode: 'movie', seq: 2 }); });
        expect(h.result.state.modeRequest).toEqual({ mode: 'movie', seq: 2 });
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
                umbreonAvailable: true,
            });
        });
        expect(h.result.state.job?.progress).toBe(42);
        expect(h.result.state.views).toEqual([viewA]);
        expect(h.result.state.activeViewId).toBe(7);
        expect(h.result.state.umbreonAvailable).toBe(true);
        // A context update never clobbers the (separately pushed) history.
        expect(h.result.state.history).toEqual([]);

        act(() => {
            harness.push({
                kind: 'history',
                entries: [
                    {
                        id: 'r1', width: 8, height: 6,
                        elapsedSec: 1, sourceSceneId: 1, sourceSceneName: 'SceneA',
                        sourceViewId: 7,
                        settingsSnapshot: { mode: 'still', backend: 'povray', commonProps: [], backendProps: [] },
                    },
                ],
            });
        });
        expect(h.result.shownResult?.id).toBe('r1');
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

// Render history: completed renders accumulate so a parameter change can be
// compared against -- and stepped back to -- the previous attempt. Each entry
// carries the snapshot that produced it, which the window restores on Back.
describe('useRenderWindowClient render history', () => {
    /** Metadata of one archived render. */
    const entry = (id: string) => ({
        id,
        width: 100,
        height: 100,
        elapsedSec: 1,
        sourceSceneId: 1,
        sourceSceneName: 'SceneA',
        settingsSnapshot: snapshot,
    });

    /** The main window pushes the whole history, oldest first. */
    const historyPush = (...ids: string[]): RenderWindowStateUpdate => ({
        kind: 'history',
        entries: ids.map(entry) as never,
    });

    it('shows the newest render of the pushed history', () => {
        const h = makeRenderHook(() => useRenderWindowClient());
        act(() => harness.push(historyPush('r1', 'r2')));

        expect(h.result.state.history.map((r) => r.id)).toEqual(['r1', 'r2']);
        expect(h.result.shownResult?.id).toBe('r2');
        h.unmount();
    });

    it('keeps the shown entry when a re-sync re-pushes the same list', () => {
        const h = makeRenderHook(() => useRenderWindowClient());
        act(() => harness.push(historyPush('r1', 'r2')));
        act(() => { h.result.goBack(); });
        expect(h.result.shownResult?.id).toBe('r1');

        // Reopening the window re-pushes the list unchanged.
        act(() => harness.push(historyPush('r1', 'r2')));
        expect(h.result.shownResult?.id).toBe('r1');
        h.unmount();
    });

    it('steps back and forward, returning the entry now shown', () => {
        const h = makeRenderHook(() => useRenderWindowClient());
        act(() => harness.push(historyPush('r1', 'r2')));

        const shown: (string | undefined)[] = [];
        act(() => { shown.push(h.result.goBack()?.id); });
        // The returned entry is what the window restores the settings from.
        expect(shown[0]).toBe('r1');
        expect(h.result.shownResult?.id).toBe('r1');

        act(() => { shown.push(h.result.goForward()?.id); });
        expect(shown[1]).toBe('r2');
        expect(h.result.shownResult?.id).toBe('r2');
        h.unmount();
    });

    it('clearHistory asks the main window to drop every past render', () => {
        const h = makeRenderHook(() => useRenderWindowClient());
        act(() => harness.push(historyPush('r1', 'r2')));

        act(() => { h.result.clearHistory(); });

        expect(harness.commands().at(-1)).toEqual({ type: 'clear-history' });
        // The list is emptied by the main window's reply, not optimistically.
        expect(h.result.state.history).toHaveLength(2);
        act(() => harness.push({ kind: 'history', entries: [] }));
        expect(h.result.shownResult).toBeNull();
        h.unmount();
    });

    it('stops at the ends of the history', () => {
        const h = makeRenderHook(() => useRenderWindowClient());
        act(() => harness.push(historyPush('r1')));

        let shown: unknown = 'unset';
        act(() => { shown = h.result.goBack(); });
        expect(shown).toBeNull();
        act(() => { shown = h.result.goForward(); });
        expect(shown).toBeNull();
        expect(h.result.shownResult?.id).toBe('r1');
        h.unmount();
    });

    it('jumps to the newest render when a new one completes mid-history', () => {
        const h = makeRenderHook(() => useRenderWindowClient());
        act(() => harness.push(historyPush('r1', 'r2')));
        act(() => { h.result.goBack(); });
        expect(h.result.shownResult?.id).toBe('r1');

        act(() => harness.push(historyPush('r1', 'r2', 'r3')));
        expect(h.result.shownResult?.id).toBe('r3');
        h.unmount();
    });

    it('reads the shown entry\'s image back from the archive, one at a time', async () => {
        const h = makeRenderHook(() => useRenderWindowClient());
        act(() => harness.push(historyPush('r1', 'r2')));
        await act(async () => { await Promise.resolve(); });

        // Only the entry on screen is fetched -- the rest stay metadata.
        const reads = (harness.api.invoke as ReturnType<typeof vi.fn>).mock.calls
            .filter((c) => c[0] === IPC.RENDER_HISTORY_READ)
            .map((c) => (c[1] as { resultId: string }).resultId);
        expect(reads).toEqual(['r2']);

        act(() => { h.result.goBack(); });
        await act(async () => { await Promise.resolve(); });
        const reads2 = (harness.api.invoke as ReturnType<typeof vi.fn>).mock.calls
            .filter((c) => c[0] === IPC.RENDER_HISTORY_READ)
            .map((c) => (c[1] as { resultId: string }).resultId);
        expect(reads2).toEqual(['r2', 'r1']);
        h.unmount();
    });
});

// The render window asks main for a hatch style's spec text; a failed invoke
// is folded into the reply shape (the editor shows it, nothing throws).
describe('useRenderWindowClient.getHatchStyleSpec', () => {
    afterEach(() => teardownElectronAPI());

    const mountWithInvoke = (invoke: (channel: string, payload?: unknown) => Promise<unknown>) => {
        const api = setupElectronAPI({
            onPush: vi.fn(() => () => {}),
            invoke: vi.fn(invoke),
        });
        const h = makeRenderHook(() => useRenderWindowClient());
        return { api, h };
    };

    it('invokes RENDER_HATCH_STYLE_GET with the style and returns the reply', async () => {
        const { api, h } = mountWithInvoke((channel) =>
            channel === IPC.RENDER_HATCH_STYLE_GET
                ? Promise.resolve({ ok: true, spec: 'layer: kind=dot\n' })
                : Promise.resolve(undefined),
        );
        const reply = await h.result.getHatchStyleSpec('manga');
        expect(api.invoke).toHaveBeenCalledWith(IPC.RENDER_HATCH_STYLE_GET, { style: 'manga' });
        expect(reply).toEqual({ ok: true, spec: 'layer: kind=dot\n' });
        h.unmount();
    });

    it('turns a rejected invoke into ok: false', async () => {
        const { h } = mountWithInvoke((channel) =>
            channel === IPC.RENDER_HATCH_STYLE_GET
                ? Promise.reject(new Error('relay down'))
                : Promise.resolve(undefined),
        );
        const reply = await h.result.getHatchStyleSpec('manga');
        expect(reply).toEqual({ ok: false, error: 'relay down' });
        h.unmount();
    });
});
