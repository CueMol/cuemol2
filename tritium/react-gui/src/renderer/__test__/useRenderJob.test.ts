/**
 * @file __test__/useRenderJob.test.ts
 * @description Contract tests for the render-job hook: start creates an
 * active job, timer ticks advance progress through its phases to
 * completion, and cancel stops an in-progress job.
 *
 * The interval callback is captured (vi.useFakeTimers does not reliably
 * flush setState from timer callbacks via act) and invoked manually.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { makeRenderHook } from './helpers/testHarness';
import { useRenderJob, isRenderJobActive } from '../hooks/useRenderJob';

describe('useRenderJob', () => {
    let timerCb: (() => void) | null;

    beforeEach(() => {
        timerCb = null;
        vi.spyOn(globalThis, 'setInterval').mockImplementation(
            ((cb: () => void) => {
                timerCb = cb;
                return 1 as unknown as ReturnType<typeof setInterval>;
            }) as typeof setInterval,
        );
        vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('start creates an active exporting job at 0%', () => {
        const h = makeRenderHook(() => useRenderJob());
        act(() => h.result.start());
        expect(h.result.job?.status).toBe('exporting');
        expect(h.result.job?.progress).toBe(0);
        expect(isRenderJobActive(h.result.job)).toBe(true);
        h.unmount();
    });

    it('timer ticks advance progress and phases to completion', () => {
        const h = makeRenderHook(() => useRenderJob());
        act(() => h.result.start());

        const seen = new Set<string>();
        for (let i = 0; i < 20 && timerCb; i++) {
            act(() => timerCb!());
            if (h.result.job) seen.add(h.result.job.status);
        }

        expect(seen.has('running')).toBe(true);
        expect(seen.has('blending')).toBe(true);
        expect(h.result.job?.status).toBe('done');
        expect(h.result.job?.progress).toBe(100);
        expect(h.result.job?.finishedAt).toBeTypeOf('number');
        // Log grows as the job progresses.
        expect((h.result.job?.log.length ?? 0)).toBeGreaterThan(2);
        h.unmount();
    });

    it('cancel stops an in-progress job', () => {
        const h = makeRenderHook(() => useRenderJob());
        act(() => h.result.start());
        act(() => timerCb!());
        act(() => h.result.cancel());

        expect(h.result.job?.status).toBe('cancelled');
        expect(isRenderJobActive(h.result.job)).toBe(false);
        h.unmount();
    });
});
