/**
 * @file hooks/react/useStaleGuard.test.ts
 * @description Pins the token semantics the fetch hooks rely on.
 */

import { describe, it, expect } from 'vitest'
import { createStaleGuard, useStaleGuard } from './useStaleGuard'
import { makeRenderHook } from '@renderer/__test__/helpers/testHarness'

describe('createStaleGuard', () => {
    it('only the latest token is current', () => {
        const g = createStaleGuard()
        const a = g.next()
        expect(g.isCurrent(a)).toBe(true)
        const b = g.next()
        expect(g.isCurrent(a)).toBe(false)
        expect(g.isCurrent(b)).toBe(true)
    })

    it('invalidate() makes every outstanding token stale without issuing one', () => {
        const g = createStaleGuard()
        const a = g.next()
        g.invalidate()
        expect(g.isCurrent(a)).toBe(false)
        // The next request is current again.
        expect(g.isCurrent(g.next())).toBe(true)
    })
})

describe('useStaleGuard', () => {
    it('keeps one guard per component for its lifetime', () => {
        const h = makeRenderHook(() => useStaleGuard())
        const first = h.result
        const token = first.next()
        h.rerender()
        expect(h.result).toBe(first)
        expect(h.result.isCurrent(token)).toBe(true)
        h.unmount()
    })
})
