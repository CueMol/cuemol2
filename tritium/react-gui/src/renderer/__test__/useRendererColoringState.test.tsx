/**
 * Degrade-detection test for hooks/useRendererColoringState.ts.
 *
 * Pins the observable wire contract: mount -> invokeService fetch, event
 * subscription with the right filter/mask, refetch on coloring /
 * defaultcolor PROPCHG, and unmount cleanup. Internals can be refactored
 * without touching this file as long as those contracts hold.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useRendererColoringState } from '../hooks/useRendererColoringState'
import { SEM_OBJECT, SEM_RENDERER, SEM_SCENE, SEM_ANY } from '../event'

void React

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

const SCENE_ID = 7
const REND_ID = 100

interface MockCm {
    invokeService: ReturnType<typeof vi.fn>
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
    fireEvent: (args: unknown) => void
}

function makeCm(): MockCm {
    let handler: ((args: unknown) => void) | null = null
    const invokeService = vi.fn(() =>
        Promise.resolve({
            ok: true,
            className: 'PaintColoring',
            defaultColor: '#000000',
            paintEntries: [],
        }),
    )
    const addEventListener = vi.fn(
        (
            _cat: string,
            _src: number,
            _evt: number,
            _scope: number,
            cb: (args: unknown) => void,
        ) => {
            handler = cb
            return Promise.resolve(42)
        },
    )
    const removeEventListener = vi.fn().mockResolvedValue(undefined)
    return {
        invokeService,
        addEventListener,
        removeEventListener,
        fireEvent(args: unknown) {
            handler?.(args)
        },
    }
}

function mountHook(cm: MockCm, rendId: number | null = REND_ID) {
    let result!: ReturnType<typeof useRendererColoringState>
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    const Probe: React.FC = () => {
        result = useRendererColoringState({
            cm: cm as unknown as Parameters<typeof useRendererColoringState>[0]['cm'],
            sceneId: SCENE_ID,
            rendId,
        })
        return null
    }
    act(() => {
        root = createRoot(container)
        root.render(React.createElement(Probe))
    })
    return {
        get result() {
            return result
        },
        unmount() {
            act(() => root.unmount())
            document.body.removeChild(container)
        },
    }
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
    })
}

afterEach(() => vi.clearAllMocks())

describe('useRendererColoringState', () => {
    it('fetches state on mount via getRendererColoringState', async () => {
        const cm = makeCm()
        const h = mountHook(cm)
        await flush()
        expect(cm.invokeService).toHaveBeenCalledWith(
            'getRendererColoringState',
            { sceneId: SCENE_ID, rendId: REND_ID, targetKind: 'renderer' },
        )
        expect(h.result.state).toMatchObject({
            ok: true,
            className: 'PaintColoring',
        })
        h.unmount()
    })

    it('subscribes with SEM_OBJECT|SEM_RENDERER|SEM_SCENE source mask scoped to the scene', async () => {
        // SEM_SCENE covers the bulk-load path: after a slow qsc load only the
        // scene-level sceneLoaded event fires, and the deck must refetch on it.
        const cm = makeCm()
        const h = mountHook(cm)
        await flush()
        expect(cm.addEventListener).toHaveBeenCalledWith(
            '',
            SEM_OBJECT | SEM_RENDERER | SEM_SCENE,
            SEM_ANY,
            SCENE_ID,
            expect.any(Function),
        )
        h.unmount()
    })

    it('does not fetch when rendId is null', async () => {
        const cm = makeCm()
        const h = mountHook(cm, null)
        await flush()
        expect(cm.invokeService).not.toHaveBeenCalled()
        h.unmount()
    })

    it('refetches on coloring PROPCHG', async () => {
        const cm = makeCm()
        const h = mountHook(cm)
        await flush()
        cm.invokeService.mockClear()
        // Mimic a PROPCHG event for `coloring` from the C++ side.
        act(() => {
            cm.fireEvent({ obj: { propname: 'coloring' } })
        })
        // The hook debounces; advance time to allow the timer to fire.
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50))
        })
        await flush()
        expect(cm.invokeService).toHaveBeenCalledWith(
            'getRendererColoringState',
            { sceneId: SCENE_ID, rendId: REND_ID, targetKind: 'renderer' },
        )
        h.unmount()
    })

    it('refetches on defaultcolor PROPCHG', async () => {
        const cm = makeCm()
        const h = mountHook(cm)
        await flush()
        cm.invokeService.mockClear()
        act(() => {
            cm.fireEvent({ obj: { propname: 'defaultcolor' } })
        })
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50))
        })
        await flush()
        expect(cm.invokeService).toHaveBeenCalled()
        h.unmount()
    })

    it('refetches on Elepot renderer-level PROPCHG (colormode / elepot / lowcol / lowpar / ramp_above)', async () => {
        // The Elepot deck's props live on the surface renderer (not on a
        // ColoringScheme), so their PROPCHG events surface with the
        // renderer-side propname. The hook must whitelist them; otherwise
        // committing a slider, swatch, or selector silently no-ops in the UI
        // (the user reported this regression after Phase 3 wiring).
        for (const propname of [
            'colormode', 'elepot', 'ramp_above',
            'lowcol', 'midcol', 'highcol',
            'lowpar', 'midpar', 'highpar',
        ]) {
            const cm = makeCm()
            const h = mountHook(cm)
            await flush()
            cm.invokeService.mockClear()
            act(() => {
                cm.fireEvent({ obj: { propname } })
            })
            await act(async () => {
                await new Promise((r) => setTimeout(r, 50))
            })
            await flush()
            expect(cm.invokeService).toHaveBeenCalled()
            h.unmount()
        }
    })

    it('ignores unrelated PROPCHG events (e.g. "visible")', async () => {
        const cm = makeCm()
        const h = mountHook(cm)
        await flush()
        cm.invokeService.mockClear()
        act(() => {
            cm.fireEvent({ obj: { propname: 'visible' } })
        })
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50))
        })
        await flush()
        expect(cm.invokeService).not.toHaveBeenCalled()
        h.unmount()
    })

    it('removes the listener on unmount', async () => {
        const cm = makeCm()
        const h = mountHook(cm)
        await flush()
        h.unmount()
        // The listener id from addEventListener (42) must be removed.
        expect(cm.removeEventListener).toHaveBeenCalledWith(42)
    })
})
