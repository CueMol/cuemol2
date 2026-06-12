/**
 * Degrade-detection tests for `useViewXform` (data source for `ViewPane`).
 *
 * Pins the observable invariants that survive internal refactors:
 *   - fetches `getViewXform` for the active view on mount and exposes the state
 *   - subscribes to SEM_VIEW property-change events scoped to the scene
 *   - removes the listener on unmount (no leaked worker-side callback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

import { useViewXform } from '../hooks/useViewXform'
import { SEM_VIEW, SEM_ANY } from '../event'
import { makeRenderHook, flushPromises } from './helpers/testHarness'

const XFORM = {
    ok: true,
    zoom: 50,
    slab: 100,
    distance: 120,
    centerX: 1,
    centerY: 2,
    centerZ: 3,
}

function makeCm() {
    return {
        invokeService: vi.fn((name: string) =>
            name === 'getViewXform' ? Promise.resolve(XFORM) : Promise.resolve({ ok: true }),
        ),
        addEventListener: vi.fn(() => Promise.resolve(42)),
        removeEventListener: vi.fn(() => Promise.resolve()),
    }
}

describe('useViewXform', () => {
    let cm: ReturnType<typeof makeCm>

    beforeEach(() => {
        cm = makeCm()
    })

    it('fetches getViewXform for the active view and exposes the state', async () => {
        const h = makeRenderHook(() =>
            useViewXform({ cm: cm as never, sceneId: 100, viewId: 7 }),
        )
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('getViewXform', { viewId: 7 })
        expect(h.result.state).toEqual({
            zoom: 50,
            slab: 100,
            distance: 120,
            centerX: 1,
            centerY: 2,
            centerZ: 3,
        })
        h.unmount()
    })

    it('subscribes to SEM_VIEW events scoped to the scene', async () => {
        const h = makeRenderHook(() =>
            useViewXform({ cm: cm as never, sceneId: 100, viewId: 7 }),
        )
        await flushPromises()
        expect(cm.addEventListener).toHaveBeenCalledWith(
            '',
            SEM_VIEW,
            SEM_ANY,
            100,
            expect.any(Function),
        )
        h.unmount()
    })

    it('removes the listener on unmount', async () => {
        const h = makeRenderHook(() =>
            useViewXform({ cm: cm as never, sceneId: 100, viewId: 7 }),
        )
        await flushPromises()
        h.unmount()
        expect(cm.removeEventListener).toHaveBeenCalledWith(42)
    })
})
