/**
 * @file hooks/cuemol/useLiveFetch.ts
 * @description Shared "fetch + auto-refresh + race-guard" engine for the
 * panel data hooks (scene tree, coloring deck, density-map panel, symmetry
 * panel, elepot object list, paint-capable renderer list, animation
 * timeline).
 *
 * Every one of those hooks has the same skeleton:
 *   1. `useState` for the panel data,
 *   2. a `refetch` callback that reads the latest scoping inputs (kept in
 *      refs so the callback identity stays stable) and bails to a fallback
 *      value when `cm` / ids are missing,
 *   3. an initial-fetch effect that re-runs when the scoping inputs change,
 *   4. one or more `useCueMolEventListener` subscriptions whose handler is
 *      the refetch (optionally filtered by `propname`).
 *
 * Two correctness concerns are owned here so the adapters cannot drift:
 *   - **Stale-fetch guard (always present).** Each `refetch` takes a
 *     `useStaleGuard` token; a result whose token is no longer current is
 *     dropped. This fixes the race where an in-flight fetch for an OLD
 *     selection resolves after the user switches to a NEW one and clobbers
 *     the newer state (see `useRendererColoringState.race.test.tsx` and
 *     `useSceneTree.staleFetch.test.tsx`).
 *   - **Cancelled-flag + debounce** are delegated to
 *     `useCueMolEventListener`; this engine composes it rather than
 *     re-implementing them.
 *
 * The engine does NOT unify the per-hook listener masks: callers pass an
 * explicit `listeners` array (1-3 entries) and the masks stay verbatim.
 */

import { useCallback, useEffect, useState } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import { useCueMolEventListener } from './useCueMolEventListener'
import { useLatestRef } from '@renderer/hooks/react/useLatestRef'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'

/** Max number of distinct event subscriptions any panel hook needs. */
const MAX_LISTENERS = 3

/**
 * One event subscription used to trigger a refetch. Mirrors the relevant
 * subset of `UseCueMolEventListenerOptions`; the handler is supplied by the
 * engine (the refetch, optionally wrapped by `eventFilter`).
 */
export interface LiveFetchListener {
    /** When false (or `cm` is null) this subscription is a no-op. */
    enabled: boolean
    srcMask: number
    evtMask: number
    /** Source uid scope (e.g. `scene.uid`); use `SEM_ANY` for global. */
    scopeId: number
    /** Debounce window in ms (0 = no debounce); see `useCueMolEventListener`. */
    debounceMs: number
    /**
     * Predicate applied BEFORE the debounce: a rejected event neither opens
     * nor consumes a debounce window. Use this to discard noise (e.g. a
     * `ui_collapsed` PROPCHG) that must not swallow the next real event.
     */
    filter?: (args: unknown) => boolean
}

export interface UseLiveFetchOptions<S> {
    cm: AsyncCueMol | null
    /** Initial state before the first fetch resolves. */
    initial: S
    /**
     * Kick off the fetch and resolve to the next state. Return `null`
     * (synchronously) to bail without fetching -- the engine then sets
     * `fallback`. Reading the latest scoping inputs from refs is the
     * caller's responsibility.
     */
    fetch: () => Promise<S> | null
    /** State applied when `fetch` bails or rejects. */
    fallback: S
    /**
     * Identity-changing inputs that should retrigger the initial fetch
     * (e.g. `[cm, sceneId, rendId]`). `cm` and `refetch` are appended by
     * the engine, so callers list only their scoping values.
     */
    fetchDeps: ReadonlyArray<unknown>
    /** 1-3 event subscriptions whose handler is the refetch. */
    listeners: ReadonlyArray<LiveFetchListener>
    /**
     * Optional predicate run on each event payload AFTER the debounce; when
     * it returns false the refetch is skipped.
     *
     * Only correct for listeners with `debounceMs: 0`. The debounce is
     * leading-edge, so with a window the handler is given the FIRST event of
     * a burst and the rest are dropped -- a predicate here then rejects the
     * whole burst whenever an event it does not want happens to arrive first.
     * Both hooks that used it were fixed by moving the predicate to the
     * listener's `filter`, which runs before the window opens. Prefer that.
     */
    eventFilter?: (args: unknown) => boolean
    /** Called when the current fetch rejects (a stale rejection is ignored). */
    onError?: (err: unknown) => void
    /** When true, expose a `loading` flag toggled around each fetch. */
    exposeLoading?: boolean
}

export interface UseLiveFetchResult<S> {
    state: S
    /** Force a refetch (also wired as the event handler). */
    refetch: () => void
    /** True while a fetch is in flight (only meaningful with `exposeLoading`). */
    loading: boolean
}

/**
 * Fetch + auto-refresh a panel's data with an always-present stale-fetch
 * guard. See the file header for the contract.
 *
 * @typeParam S - the panel state shape.
 * @returns `{ state, refetch, loading }`.
 */
export function useLiveFetch<S>(opts: UseLiveFetchOptions<S>): UseLiveFetchResult<S> {
    const { cm, initial, fetchDeps, listeners, eventFilter, exposeLoading } = opts

    const [state, setState] = useState<S>(initial)
    const [loading, setLoading] = useState(false)

    // A fetch resolving after a newer one started is dropped. Without this a
    // switch to a new selection can be overwritten by the old selection's
    // late-resolving fetch.
    const guard = useStaleGuard()

    // Latest closures in refs so `refetch` identity stays stable across
    // renders (its dep list is just `[cm]`).
    const fetchRef = useLatestRef(opts.fetch)
    const fallbackRef = useLatestRef(opts.fallback)
    const onErrorRef = useLatestRef(opts.onError)

    const refetch = useCallback(() => {
        const token = guard.next()
        const promise = fetchRef.current()
        if (promise === null) {
            setState(fallbackRef.current)
            return
        }
        if (exposeLoading) setLoading(true)
        promise
            .then((res) => {
                if (!guard.isCurrent(token)) return
                setState(res)
            })
            .catch((err: unknown) => {
                if (!guard.isCurrent(token)) return
                onErrorRef.current?.(err)
                setState(fallbackRef.current)
            })
            .finally(() => {
                if (exposeLoading && guard.isCurrent(token)) setLoading(false)
            })
    }, [cm, exposeLoading, guard, fetchRef, fallbackRef, onErrorRef])

    // Initial fetch + refetch when scoping inputs change.
    useEffect(() => {
        refetch()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refetch, ...fetchDeps])

    // Event-driven refetch. When `eventFilter` is set the refetch only
    // fires for matching payloads (e.g. coloring's propname whitelist).
    const handler = useCallback(
        (args: unknown) => {
            if (eventFilter && !eventFilter(args)) return
            refetch()
        },
        [refetch, eventFilter],
    )

    // Subscriptions are wired through a fixed number of hook calls (React
    // requires a stable hook order). Unused slots are disabled no-ops.
    for (let i = 0; i < MAX_LISTENERS; i++) {
        const l = listeners[i]
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useCueMolEventListener({
            cm,
            enabled: l ? l.enabled : false,
            category: '',
            srcMask: l ? l.srcMask : 0,
            evtMask: l ? l.evtMask : 0,
            scopeId: l ? l.scopeId : -1,
            handler,
            debounceMs: l ? l.debounceMs : 0,
            filter: l?.filter,
        })
    }

    return { state, refetch, loading }
}
