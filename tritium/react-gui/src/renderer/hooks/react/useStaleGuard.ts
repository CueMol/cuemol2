/**
 * @file renderer/hooks/react/useStaleGuard.ts
 * @description Token guard that lets an async result be dropped when a
 * newer request has started since.
 *
 * The race it closes: the user switches from A to B; the fetch for A was
 * still in flight and resolves after B's, clobbering B's state with A's.
 * Every request takes a token (`next()`); on resolve it applies its result
 * only if it is still the latest (`isCurrent(token)`).
 */

import { useRef } from 'react'

export interface StaleGuard {
    /** Start a new request; returns its token and makes every earlier token stale. */
    next(): number
    /** Whether `token` still belongs to the latest request. */
    isCurrent(token: number): boolean
    /** Make every outstanding request stale without starting a new one. */
    invalidate(): void
}

/** Plain (non-hook) guard for class or module state. */
export function createStaleGuard(): StaleGuard {
    let current = 0
    return {
        next: () => ++current,
        isCurrent: (token) => token === current,
        invalidate: () => {
            current++
        },
    }
}

/**
 * A guard whose identity is stable for the component's lifetime.
 *
 * @example
 *   const guard = useStaleGuard()
 *   const refetch = useCallback(() => {
 *       const token = guard.next()
 *       fetchThing().then((res) => {
 *           if (!guard.isCurrent(token)) return   // a newer fetch has started
 *           setState(res)
 *       })
 *   }, [guard])
 */
export function useStaleGuard(): StaleGuard {
    const ref = useRef<StaleGuard | null>(null)
    if (ref.current === null) ref.current = createStaleGuard()
    return ref.current
}
