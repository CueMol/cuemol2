/**
 * @file hooks/react/useLatestRef.ts
 * @description Ref that always holds the latest render's value.
 */

import { useRef, type MutableRefObject } from 'react'

/**
 * Keep `value` readable from a stable callback without listing it in the
 * callback's deps (and so without recreating the callback each render).
 *
 * @param value - The value to mirror; re-read via `ref.current`.
 * @returns A ref whose `.current` is updated on every render.
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
    const ref = useRef(value)
    ref.current = value
    return ref
}
