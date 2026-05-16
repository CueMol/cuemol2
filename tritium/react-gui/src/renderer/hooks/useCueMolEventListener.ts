/**
 * @file hooks/useCueMolEventListener.ts
 * @description Single-listener subscription against the CueMol event
 * manager (`cm.addEventListener` / `removeEventListener`). Encapsulates
 * the cancelled-flag race documented in tritium/CLAUDE.md, plus an
 * optional leading-edge debounce for event-burst coalescing.
 *
 * Resubscribes when `cm`, `enabled`, the filter args, or `debounceMs`
 * change. The handler is held in a ref so callers can pass an inline
 * function without forcing a resubscribe on every render.
 */

import { useEffect, useRef } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'

export interface UseCueMolEventListenerOptions {
    cm: AsyncCueMol | null
    /** When false (or `cm` is null) the effect is a no-op. Defaults to true. */
    enabled?: boolean
    category: string
    srcMask: number
    evtMask: number
    /** Source uid scope (e.g. `scene.uid`); use `SEM_ANY` for global. */
    scopeId: number
    handler: (args: unknown) => void
    /**
     * If > 0, coalesce events: the first event in a window schedules a
     * single handler call after `debounceMs`; events arriving inside
     * the window are dropped (the trailing call still receives the
     * first event's payload). Useful for refetch-on-burst patterns.
     */
    debounceMs?: number
}

export function useCueMolEventListener(opts: UseCueMolEventListenerOptions): void {
    const { cm, enabled = true, category, srcMask, evtMask, scopeId, debounceMs = 0 } = opts
    const handlerRef = useRef(opts.handler)
    handlerRef.current = opts.handler

    useEffect(() => {
        if (!cm || !enabled) return

        let cbid: number | null = null
        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | null = null

        const fire = (args: unknown): void => {
            if (cancelled) return
            if (debounceMs > 0) {
                if (timer !== null) return
                timer = setTimeout(() => {
                    timer = null
                    if (!cancelled) handlerRef.current(args)
                }, debounceMs)
            } else {
                handlerRef.current(args)
            }
        }

        ;(async () => {
            try {
                const id = await cm.addEventListener(category, srcMask, evtMask, scopeId, fire)
                if (cancelled) {
                    cm.removeEventListener(id).catch(() => {})
                    return
                }
                cbid = id
            } catch (err) {
                console.warn('cm.addEventListener failed:', err)
            }
        })()

        return () => {
            cancelled = true
            if (timer !== null) clearTimeout(timer)
            if (cbid !== null) cm.removeEventListener(cbid).catch(() => {})
        }
    }, [cm, enabled, category, srcMask, evtMask, scopeId, debounceMs])
}
