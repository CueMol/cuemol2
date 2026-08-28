/**
 * @file renderer/lib/useLiveFetch.test.tsx
 * @description Pins the engine contracts the panel hooks depend on: the
 * stale-fetch guard, fallback + onError on a rejected current fetch, and
 * the listener `filter` running before the debounce.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { useLiveFetch } from './useLiveFetch'
import { makeRenderHook } from '../__test__/helpers/testHarness'

void React
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

interface Deferred<T> {
    promise: Promise<T>
    resolve: (v: T) => void
    reject: (e: unknown) => void
}
function deferred<T>(): Deferred<T> {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}

/** Fake cm that hands every listener's `fire` callback back to the test. */
function makeCm() {
    const fires: Array<(args: unknown) => void> = []
    return {
        fires,
        addEventListener: vi.fn(async (_c: string, _s: number, _e: number, _scope: number, fire: (a: unknown) => void) => {
            fires.push(fire)
            return fires.length
        }),
        removeEventListener: vi.fn(async () => undefined),
    }
}

const flush = async (): Promise<void> => {
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

afterEach(() => vi.useRealTimers())

describe('useLiveFetch', () => {
    it('drops a fetch that resolves after a newer one started', async () => {
        const cm = makeCm()
        const pending: Deferred<string>[] = []
        const h = makeRenderHook(() =>
            useLiveFetch<string>({
                cm: cm as never,
                initial: '',
                fallback: 'fallback',
                fetch: () => { const d = deferred<string>(); pending.push(d); return d.promise },
                fetchDeps: [],
                listeners: [],
            }),
        )
        await flush()
        act(() => h.result.refetch())
        expect(pending).toHaveLength(2)
        pending[1].resolve('second')
        await flush()
        pending[0].resolve('first-late')
        await flush()
        expect(h.result.state).toBe('second')
        h.unmount()
    })

    it('applies fallback and reports the error only for the current fetch', async () => {
        const cm = makeCm()
        const onError = vi.fn()
        const pending: Deferred<string>[] = []
        const h = makeRenderHook(() =>
            useLiveFetch<string>({
                cm: cm as never,
                initial: '',
                fallback: 'fallback',
                fetch: () => { const d = deferred<string>(); pending.push(d); return d.promise },
                fetchDeps: [],
                listeners: [],
                onError,
            }),
        )
        await flush()
        act(() => h.result.refetch())
        pending[1].resolve('second')
        await flush()
        // A stale rejection is silent.
        pending[0].reject(new Error('late failure'))
        await flush()
        expect(onError).not.toHaveBeenCalled()
        expect(h.result.state).toBe('second')

        act(() => h.result.refetch())
        pending[2].reject(new Error('boom'))
        await flush()
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }))
        expect(h.result.state).toBe('fallback')
        h.unmount()
    })

    it('a listener filter runs before the debounce, so a rejected event cannot swallow the next one', async () => {
        const cm = makeCm()
        const fetch = vi.fn(() => Promise.resolve('x'))
        const h = makeRenderHook(() =>
            useLiveFetch<string>({
                cm: cm as never,
                initial: '',
                fallback: '',
                fetch,
                fetchDeps: [],
                listeners: [{
                    enabled: true, srcMask: 1, evtMask: -1, scopeId: 7, debounceMs: 30,
                    filter: (args) => (args as { noise?: boolean }).noise !== true,
                }],
            }),
        )
        await flush()
        expect(fetch).toHaveBeenCalledTimes(1) // the initial fetch
        expect(cm.fires).toHaveLength(1)

        vi.useFakeTimers()
        act(() => { cm.fires[0]({ noise: true }) })
        act(() => { vi.advanceTimersByTime(5) })
        act(() => { cm.fires[0]({ noise: false }) })
        act(() => { vi.advanceTimersByTime(35) })
        // Exactly one refetch: the real event opened its own window; the
        // noise event opened none.
        expect(fetch).toHaveBeenCalledTimes(2)
        h.unmount()
    })
})
