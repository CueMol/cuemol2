/**
 * @file __test__/hatchStyleSpecService.test.ts
 * @description Pins the worker service behind the hatch layer editor's
 * template: it resolves a style through the umbreon exporter's
 * getHatchStyleSpec, and degrades to `ok: false` (never a throw) when the
 * build has no umbreon, the addon predates the API, or the name is unknown.
 */

import { describe, it, expect, vi } from 'vitest';
import { services } from '../worker/server/services/hatchStyleSpec.service';
import type { WorkerContext } from '../worker/server/types/WorkerContext';

const ctxWith = (createHandler: (...args: unknown[]) => unknown) =>
    ({ strMgr: { createHandler } } as unknown as WorkerContext);

describe('getHatchStyleSpec service', () => {
    it('resolves a style through the umbreon exporter', () => {
        const getHatchStyleSpec = vi.fn(() => 'layer: kind=line\n');
        const createHandler = vi.fn(() => ({ getHatchStyleSpec }));
        const res = services.getHatchStyleSpec(ctxWith(createHandler), { style: 'ink-cross' });
        expect(createHandler).toHaveBeenCalledWith('umbreon', 2);
        expect(getHatchStyleSpec).toHaveBeenCalledWith('ink-cross');
        expect(res).toEqual({ ok: true, spec: 'layer: kind=line\n' });
    });

    it('reports a build without umbreon instead of throwing', () => {
        const res = services.getHatchStyleSpec(
            ctxWith(() => { throw new Error('no handler'); }),
            { style: 'manga' },
        );
        expect(res.ok).toBe(false);
    });

    it('reports an addon without the API, and an unknown style', () => {
        const noApi = services.getHatchStyleSpec(ctxWith(() => ({})), { style: 'manga' });
        expect(noApi.ok).toBe(false);
        const unknown = services.getHatchStyleSpec(
            ctxWith(() => ({ getHatchStyleSpec: () => '' })),
            { style: 'no-such' },
        );
        expect(unknown).toEqual({ ok: false, error: 'unknown hatch style: no-such' });
    });
});
