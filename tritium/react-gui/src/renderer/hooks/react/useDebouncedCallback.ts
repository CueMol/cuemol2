/**
 * @file renderer/hooks/react/useDebouncedCallback.ts
 * @description Stable debounced wrapper around a callback.
 *
 * Two modes:
 *   - 'trailing' (default): the call runs once `ms` has passed without a
 *     new call, with the latest arguments -- for "persist after the user
 *     stops dragging" (see PERSIST_DEBOUNCE_MS).
 *   - 'leading': the first call runs at once and later calls inside the
 *     window are dropped -- for "react to a burst once, now".
 *
 * The returned function keeps its identity across renders; the wrapped
 * callback is read through a latest-ref so an inline function is fine.
 * A pending trailing call is cancelled on unmount; call `flush()` from
 * your own cleanup if it must run.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useLatestRef } from './useLatestRef'

export type DebounceMode = 'leading' | 'trailing'

export interface DebouncedCallback<A extends unknown[]> {
    (...args: A): void
    /** Run a pending trailing call now (no-op when nothing is pending). */
    flush(): void
    /** Drop a pending trailing call / close a leading window. */
    cancel(): void
    /** Whether a trailing call is pending (or a leading window is open). */
    pending(): boolean
}

/**
 * Debounce `fn`.
 *
 * @param fn - Callback to debounce; the latest render's `fn` is what runs.
 * @param ms - Window length in milliseconds.
 * @param mode - 'trailing' (default) or 'leading'; see the file header.
 * @returns A stable debounced function with `flush` / `cancel` / `pending`.
 */
export function useDebouncedCallback<A extends unknown[]>(
    fn: (...args: A) => void,
    ms: number,
    mode: DebounceMode = 'trailing',
): DebouncedCallback<A> {
    const fnRef = useLatestRef(fn)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const argsRef = useRef<A | null>(null)

    const debounced = useMemo(() => {
        const clear = (): void => {
            if (timerRef.current !== null) clearTimeout(timerRef.current)
            timerRef.current = null
            argsRef.current = null
        }
        const call = ((...args: A): void => {
            if (mode === 'leading') {
                if (timerRef.current !== null) return
                timerRef.current = setTimeout(clear, ms)
                fnRef.current(...args)
                return
            }
            argsRef.current = args
            if (timerRef.current !== null) clearTimeout(timerRef.current)
            timerRef.current = setTimeout(() => {
                const a = argsRef.current
                clear()
                if (a !== null) fnRef.current(...a)
            }, ms)
        }) as DebouncedCallback<A>
        call.flush = () => {
            if (timerRef.current === null) return
            const a = argsRef.current
            clear()
            if (a !== null) fnRef.current(...a)
        }
        call.cancel = clear
        call.pending = () => timerRef.current !== null
        return call
    }, [ms, mode, fnRef])

    useEffect(() => () => debounced.cancel(), [debounced])

    return debounced
}
