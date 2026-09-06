/**
 * @file main/renderActivity.test.ts
 * @description The render-activity hold is edge-triggered on the job state
 * the main window pushes, and is released by every idle signal.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({}));

import type { RenderWindowStateUpdate } from '@shared/types/renderWindow';
import { createRenderActivityGuard } from './renderActivity';

/** A 'context' update carrying a job in the given status (null = no job). */
function context(status: string | null): RenderWindowStateUpdate {
    return {
        kind: 'context',
        job: status === null
            ? null
            : { jobId: 'render-1', progress: 0, status, phase: '', log: [], startedAt: 0 },
        views: [],
        activeViewId: null,
        umbreonAvailable: false,
    };
}

function makeGuard() {
    const hooks = { onStart: vi.fn(), onStop: vi.fn() };
    return { hooks, guard: createRenderActivityGuard(hooks) };
}

describe('createRenderActivityGuard', () => {
    it('holds once from the first active status to the terminal one, ignoring ticks and other kinds', () => {
        const { hooks, guard } = makeGuard();

        guard.observe(context('exporting'));
        guard.observe(context('running'));
        guard.observe({ kind: 'framePreview', preview: { dataUrl: '', width: 1, height: 1, frameIndex: 0 } });
        guard.observe(context('running'));
        guard.observe(context('blending'));
        expect(hooks.onStart).toHaveBeenCalledTimes(1);
        expect(hooks.onStop).not.toHaveBeenCalled();

        guard.observe(context('done'));
        guard.observe(context('done'));
        expect(hooks.onStart).toHaveBeenCalledTimes(1);
        expect(hooks.onStop).toHaveBeenCalledTimes(1);
    });

    it('releases on a null job (reload) and on reset() (window closed), and neither fires while idle', () => {
        const { hooks, guard } = makeGuard();

        guard.reset();
        guard.observe(context(null));
        expect(hooks.onStop).not.toHaveBeenCalled();

        guard.observe(context('exporting'));
        guard.observe(context(null));
        expect(hooks.onStart).toHaveBeenCalledTimes(1);
        expect(hooks.onStop).toHaveBeenCalledTimes(1);

        guard.observe(context('blending'));
        guard.reset();
        guard.reset();
        expect(hooks.onStart).toHaveBeenCalledTimes(2);
        expect(hooks.onStop).toHaveBeenCalledTimes(2);
    });
});
