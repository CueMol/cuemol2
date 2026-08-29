/**
 * @file hooks/useMultiGradState.ts
 * @description Live multi-gradient state (nodes / colormode / color-map
 * binding / map list / map stats) for the Multi-gradient deck.
 *
 * Fetches via `getMultiGradState` and refetches on SEM_OBJECT |
 * SEM_RENDERER events scoped to the scene (30 ms debounce). The PROPCHG
 * filter passes `multi_grad` / `colormode` / `color_mapname` plus events
 * without a propname (ADDED / REMOVING, and the C++ MultiGradEvent whose
 * propname representation is a runtime detail -- the fallback keeps the
 * deck in sync even if it arrives with an unexpected name shape).
 */

import { useRef } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { GetMultiGradStateResult } from '../worker/server/services/rendererColoring.service'
import { SEM_OBJECT, SEM_RENDERER, SEM_ANY } from '../event'
import { useLiveFetch } from '@renderer/hooks/cuemol/useLiveFetch'
import { EVENT_BURST_DEBOUNCE_MS } from '@renderer/utils/timing'

const EMPTY_STATE: GetMultiGradStateResult = {
    ok: false,
    capable: false,
    colormode: '',
    colorMapName: '',
    nodes: [],
    mapObjects: [],
    mapStats: null,
    mapPercentiles: null,
    mapVoxelCount: null,
    mapPeakCount: null,
}

/** Renderer props whose PROPCHG must refresh the multigrad deck. */
const MULTIGRAD_REFETCH_PROPS = new Set<string>([
    'multi_grad',
    'colormode',
    'color_mapname',
])

/**
 * Refetch filter: pass whitelisted propnames and any event without a
 * propname (ADDED / REMOVING / unknown-shape MultiGradEvent). The
 * `multi_grad` prefix match also covers nested-prop event names
 * (e.g. "multi_grad.<child>") should the C++ side qualify them.
 */
function shouldRefetchMultiGrad(args: unknown): boolean {
    const payload = args as { obj?: { propname?: string } } | undefined
    const propname = payload?.obj?.propname
    if (propname === undefined) return true
    return (
        MULTIGRAD_REFETCH_PROPS.has(propname) ||
        propname.startsWith('multi_grad')
    )
}

export interface UseMultiGradStateOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    rendId: number | null
    /** When false the hook idles (deck not visible). */
    enabled?: boolean
}

export interface UseMultiGradStateResult {
    state: GetMultiGradStateResult | null
    refetch: () => void
}

/**
 * Fetch + auto-refresh the multi-gradient state of one renderer.
 * Returns `null` state until the first fetch resolves.
 */
export function useMultiGradState({
    cm,
    sceneId,
    rendId,
    enabled = true,
}: UseMultiGradStateOptions): UseMultiGradStateResult {
    const sceneIdRef = useRef(sceneId)
    const rendIdRef = useRef(rendId)
    const enabledRef = useRef(enabled)
    sceneIdRef.current = sceneId
    rendIdRef.current = rendId
    enabledRef.current = enabled

    const { state, refetch } = useLiveFetch<GetMultiGradStateResult | null>({
        cm,
        initial: null,
        fallback: null,
        fetch: () => {
            const sid = sceneIdRef.current
            const rid = rendIdRef.current
            if (!cm || !enabledRef.current || sid === undefined || rid === null) {
                return null
            }
            return cm
                .invokeService('getMultiGradState', { sceneId: sid, rendId: rid })
                .then((res) => res ?? EMPTY_STATE)
                .catch((err: unknown) => {
                    console.warn('getMultiGradState failed:', err)
                    return EMPTY_STATE
                })
        },
        fetchDeps: [sceneId, rendId, enabled],
        eventFilter: shouldRefetchMultiGrad,
        listeners: [
            {
                enabled: enabled && sceneId !== undefined && rendId !== null,
                srcMask: SEM_OBJECT | SEM_RENDERER,
                evtMask: SEM_ANY,
                scopeId: sceneId ?? -1,
                debounceMs: EVENT_BURST_DEBOUNCE_MS,
            },
        ],
    })

    return { state, refetch }
}
