/**
 * @file __test__/useRendererColoringState.race.test.tsx
 * @description Race-pin (degrade-detection) test for the stale-fetch race in
 * hooks/useRendererColoringState.ts.
 *
 * THE RACE: when the selected renderer switches (ColorPane changes `rendId`
 * from A to B), an in-flight `getRendererColoringState` fetch for the OLD
 * rendId A can resolve AFTER the newer fetch for B. Without a fetch-token
 * guard, A's stale result overwrites B's state, leaving the deck showing the
 * wrong renderer's coloring.
 *
 * This test deterministically drives that interleave (A's promise is resolved
 * LAST) and asserts the final state belongs to B. It was written BEFORE the
 * `useLiveFetch` token guard landed and fails against the no-guard code,
 * demonstrating the race; it must stay GREEN once the guard is in place.
 *
 * Pins observable behaviour (final state == newest selection), not internals.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useRendererColoringState } from '../hooks/useRendererColoringState'

void React
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

const SCENE_ID = 7
const REND_A = 100
const REND_B = 200

interface Deferred<T> {
    promise: Promise<T>
    resolve: (v: T) => void
}

function defer<T>(): Deferred<T> {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => {
        resolve = r
    })
    return { promise, resolve }
}

/**
 * Fake cm whose `getRendererColoringState` returns a controllable deferred
 * per rendId so the test can choose the resolution order.
 */
function makeCm() {
    const pending = new Map<number, Deferred<unknown>>()
    const invokeService = vi.fn((_name: string, args: { rendId: number }) => {
        const d = defer<unknown>()
        pending.set(args.rendId, d)
        return d.promise
    })
    const addEventListener = vi.fn(async () => 42)
    const removeEventListener = vi.fn(async () => {})
    return {
        invokeService,
        addEventListener,
        removeEventListener,
        resolveFor(rendId: number, value: unknown) {
            pending.get(rendId)!.resolve(value)
        },
    }
}

function stateFor(rendId: number) {
    return {
        ok: true,
        className: `Coloring-${rendId}`,
        defaultColor: '#000000',
        paintEntries: [],
        surfaceType: '',
        colormode: '',
    }
}

function mountHook(cm: ReturnType<typeof makeCm>) {
    let result!: ReturnType<typeof useRendererColoringState>
    let setRendId!: (id: number) => void
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    const Probe: React.FC = () => {
        const [rendId, setId] = React.useState<number | null>(REND_A)
        setRendId = setId
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
        switchTo(id: number) {
            act(() => setRendId(id))
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

describe('useRendererColoringState -- stale-fetch race', () => {
    it('a stale fetch for the OLD rendId resolving LAST must not overwrite the NEW selection', async () => {
        const cm = makeCm()
        const h = mountHook(cm)
        await flush()
        // Fetch for A is now in flight (deferred, unresolved).

        // Switch selection to B -> a second fetch goes out for B.
        h.switchTo(REND_B)
        await flush()

        // B resolves first (the user's current selection).
        act(() => cm.resolveFor(REND_B, stateFor(REND_B)))
        await flush()
        expect(h.result.state).toMatchObject({ className: `Coloring-${REND_B}` })

        // The stale A fetch resolves LAST. Without a token guard this stale
        // result clobbers B's state; with the guard it is dropped.
        act(() => cm.resolveFor(REND_A, stateFor(REND_A)))
        await flush()

        expect(h.result.state).toMatchObject({ className: `Coloring-${REND_B}` })
        h.unmount()
    })
})
