/**
 * @file hooks/react/useDebouncedCallback.test.ts
 * @description Pins trailing / leading debounce semantics, flush / cancel,
 * latest-callback reading and identity stability.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useDebouncedCallback } from './useDebouncedCallback'
import { makeRenderHook } from '@renderer/__test__/helpers/testHarness'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('trailing (default)', () => {
    it('runs once with the latest arguments after the quiet period', () => {
        const fn = vi.fn()
        const h = makeRenderHook(() => useDebouncedCallback(fn, 100))
        h.result(1)
        h.result(2)
        vi.advanceTimersByTime(90)
        h.result(3)
        vi.advanceTimersByTime(90)
        expect(fn).not.toHaveBeenCalled()
        vi.advanceTimersByTime(10)
        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn).toHaveBeenCalledWith(3)
        h.unmount()
    })

    it('flush() runs the pending call now; cancel() drops it', () => {
        const fn = vi.fn()
        const h = makeRenderHook(() => useDebouncedCallback(fn, 100))
        h.result('a')
        expect(h.result.pending()).toBe(true)
        h.result.flush()
        expect(fn).toHaveBeenCalledWith('a')
        expect(h.result.pending()).toBe(false)

        h.result('b')
        h.result.cancel()
        vi.advanceTimersByTime(200)
        expect(fn).toHaveBeenCalledTimes(1)
        h.unmount()
    })

    it('a pending call is dropped on unmount', () => {
        const fn = vi.fn()
        const h = makeRenderHook(() => useDebouncedCallback(fn, 100))
        h.result('a')
        h.unmount()
        vi.advanceTimersByTime(200)
        expect(fn).not.toHaveBeenCalled()
    })
})

describe('leading', () => {
    it('runs the first call at once and drops the rest of the window', () => {
        const fn = vi.fn()
        const h = makeRenderHook(() => useDebouncedCallback(fn, 100, 'leading'))
        h.result(1)
        h.result(2)
        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn).toHaveBeenCalledWith(1)
        vi.advanceTimersByTime(100)
        h.result(3)
        expect(fn).toHaveBeenCalledTimes(2)
        expect(fn).toHaveBeenLastCalledWith(3)
        h.unmount()
    })
})

describe('identity', () => {
    it('is stable across renders and reads the latest callback', () => {
        let fn = vi.fn()
        const h = makeRenderHook(() => useDebouncedCallback(fn, 50))
        const first = h.result
        const second = vi.fn()
        fn = second
        h.rerender()
        expect(h.result).toBe(first)
        h.result('x')
        vi.advanceTimersByTime(50)
        expect(second).toHaveBeenCalledWith('x')
        h.unmount()
    })
})
