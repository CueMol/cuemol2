/**
 * Degrade-detection tests for `useSceneRenderOpts` (data source for
 * `RenderingPane`).
 *
 * Pins the observable invariants:
 *   - fetches `getSceneRenderOpts` for the active scene and exposes the state
 *   - subscribes to SEM_SCENE property-change events scoped to the scene
 *   - removes the listener on unmount (no leaked worker-side callback)
 *   - setProp round-trips a single-mode write through `setSceneRenderOpts`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

import { useSceneRenderOpts } from '../hooks/useSceneRenderOpts'
import { SEM_SCENE, SEM_PROPCHG } from '../event'
import { makeRenderHook, flushPromises } from './helpers/testHarness'

const STATE = {
    ok: true,
    aoEnabled: true,
    aoRadius: 4,
    aoIntensity: 2.2,
    aoSlices: 9,
    aoSteps: 3,
    aoHalfRes: false,
    aaMethod: 'fxaa',
    aaJitterLevel: 0,
    bgColor: '#000000',
    useColProof: false,
    iccFilename: '',
    iccIntent: 'perceptual',
}

function makeCm() {
    return {
        invokeService: vi.fn((name: string) =>
            name === 'getSceneRenderOpts' ? Promise.resolve(STATE) : Promise.resolve({ ok: true }),
        ),
        addEventListener: vi.fn(() => Promise.resolve(99)),
        removeEventListener: vi.fn(() => Promise.resolve()),
    }
}

describe('useSceneRenderOpts', () => {
    let cm: ReturnType<typeof makeCm>

    beforeEach(() => {
        cm = makeCm()
    })

    it('fetches getSceneRenderOpts and exposes the state (without ok)', async () => {
        const h = makeRenderHook(() => useSceneRenderOpts({ cm: cm as never, sceneId: 5 }))
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('getSceneRenderOpts', { sceneId: 5 })
        expect(h.result.state).toEqual({
            aoEnabled: true,
            aoRadius: 4,
            aoIntensity: 2.2,
            aoSlices: 9,
            aoSteps: 3,
            aoHalfRes: false,
            aaMethod: 'fxaa',
            aaJitterLevel: 0,
            bgColor: '#000000',
            useColProof: false,
            iccFilename: '',
            iccIntent: 'perceptual',
        })
        h.unmount()
    })

    it('subscribes to SEM_SCENE PROPCHG events scoped to the scene', async () => {
        const h = makeRenderHook(() => useSceneRenderOpts({ cm: cm as never, sceneId: 5 }))
        await flushPromises()
        expect(cm.addEventListener).toHaveBeenCalledWith(
            '',
            SEM_SCENE,
            SEM_PROPCHG,
            5,
            expect.any(Function),
        )
        h.unmount()
    })

    it('setProp round-trips a single-mode write', async () => {
        const h = makeRenderHook(() => useSceneRenderOpts({ cm: cm as never, sceneId: 5 }))
        await flushPromises()
        h.result.setProp({ aoEnabled: false }, 'Ambient occlusion')
        expect(cm.invokeService).toHaveBeenCalledWith('setSceneRenderOpts', {
            sceneId: 5,
            patch: { aoEnabled: false },
            mode: 'single',
            label: 'Ambient occlusion',
        })
        h.unmount()
    })

    it('removes the listener on unmount', async () => {
        const h = makeRenderHook(() => useSceneRenderOpts({ cm: cm as never, sceneId: 5 }))
        await flushPromises()
        h.unmount()
        expect(cm.removeEventListener).toHaveBeenCalledWith(99)
    })
})
