/**
 * @file __test__/useRenderJob.test.ts
 * @description Contract tests for the render-job hook: starting calls the
 * `renderStart` service, `render-progress` updates advance the job,
 * completion emits a result, and cancel calls `renderCancel`.
 */

import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { makeRenderHook } from './helpers/testHarness';
import { useRenderJob, isRenderJobActive } from '../hooks/useRenderJob';
import type { RenderUpdate, RenderStartResult } from '../worker/shared/renderTypes';
import { DEFAULT_RENDER_BINARIES } from '../worker/shared/renderTypes';
import type {
    RenderResult,
    RenderSettingsSnapshot,
    RenderSource,
} from '../data/renderResult';

const snapshot: RenderSettingsSnapshot = {
    mode: 'still',
    backend: 'povray',
    commonProps: [],
    backendProps: [],
};
const source: RenderSource = { sceneId: 1, sceneName: 'Scene1', viewId: 7 };
const startParams = {
    sceneId: 1,
    viewId: 7,
    snapshot,
    source,
    binaries: DEFAULT_RENDER_BINARIES,
};

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

describe('useRenderJob', () => {
    it('start issues renderStart and records the worker jobId', async () => {
        const { cm } = makeCm();
        const h = makeRenderHook(() => useRenderJob({ cm: cm as never, onComplete: vi.fn() }));
        await act(async () => { await h.result.start(startParams); });

        expect(cm.invokeService).toHaveBeenCalledWith('renderStart', {
            sceneId: 1, viewId: 7, snapshot, binaries: DEFAULT_RENDER_BINARIES,
        });
        expect(h.result.job?.status).toBe('exporting');
        expect(h.result.job?.jobId).toBe('job-1');
        h.unmount();
    });

    it('progress updates advance the job', async () => {
        const { cm, emit } = makeCm();
        const h = makeRenderHook(() => useRenderJob({ cm: cm as never, onComplete: vi.fn() }));
        await act(async () => { await h.result.start(startParams); });

        act(() => emit({
            type: 'progress', jobId: 'job-1', progress: 42, phase: 'running',
            logChunk: 'Rendered 42%',
        }));
        expect(h.result.job?.status).toBe('running');
        expect(h.result.job?.progress).toBe(42);
        expect(h.result.job?.log).toContain('Rendered 42%');
        h.unmount();
    });

    it('completion marks the job done and hands over the result + image path', async () => {
        const { cm, emit } = makeCm();
        const onComplete = vi.fn();
        const h = makeRenderHook(() => useRenderJob({ cm: cm as never, onComplete }));
        await act(async () => { await h.result.start(startParams); });

        act(() => emit({
            type: 'complete', jobId: 'job-1',
            imagePath: '/tmp/render/out.png', width: 800, height: 600, elapsedSec: 3.5,
        }));
        expect(h.result.job?.status).toBe('done');
        expect(onComplete).toHaveBeenCalledTimes(1);
        const result = onComplete.mock.calls[0][0] as RenderResult;
        expect(result.sourceSceneName).toBe('Scene1');
        // The image itself is never inlined: the caller archives this file and
        // the viewer reads it back by result id. The work dir rides along so
        // the caller can clean it up with the history.
        expect(onComplete.mock.calls[0][1]).toEqual({ path: '/tmp/render/out.png' });
        h.unmount();
    });

    it('a failed renderStart marks the job as error', async () => {
        const { cm } = makeCm({ ok: false, jobId: '', error: 'Scene not found' });
        const h = makeRenderHook(() => useRenderJob({ cm: cm as never, onComplete: vi.fn() }));
        await act(async () => { await h.result.start(startParams); });

        expect(h.result.job?.status).toBe('error');
        expect(h.result.job?.log.join(' ')).toContain('Scene not found');
        h.unmount();
    });

    it('cancel stops an active job and calls renderCancel', async () => {
        const { cm } = makeCm();
        const h = makeRenderHook(() => useRenderJob({ cm: cm as never, onComplete: vi.fn() }));
        await act(async () => { await h.result.start(startParams); });
        await act(async () => { await h.result.cancel(); });

        expect(h.result.job?.status).toBe('cancelled');
        expect(isRenderJobActive(h.result.job)).toBe(false);
        expect(cm.invokeService).toHaveBeenCalledWith('renderCancel', { jobId: 'job-1' });
        h.unmount();
    });
});
