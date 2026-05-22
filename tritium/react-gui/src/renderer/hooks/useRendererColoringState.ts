/**
 * @file hooks/useRendererColoringState.ts
 * @description Live coloring state (class + Paint entries / defaultcolor)
 * for the Coloring panel's deck content.
 *
 * Fetches via `getRendererColoringState` and refetches on SEM_RENDERER
 * PROPCHG events whose `propname` is `coloring` or `defaultcolor`. Other
 * property changes are ignored to avoid spurious refreshes during e.g.
 * visibility toggles.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type {
    ColoringTargetKind,
    GetRendererColoringStateResult,
} from '../worker/server/services/rendererColoring.service'
import { SEM_OBJECT, SEM_RENDERER, SEM_ANY } from '../event'
import { useCueMolEventListener } from './useCueMolEventListener'

const REFETCH_DEBOUNCE_MS = 30
// Listen for renderer events when editing a renderer's coloring and for
// object events when editing an object's coloring. Combining the masks
// keeps the subscription wire identical regardless of target kind.
const COLORING_EVENT_MASK = SEM_OBJECT | SEM_RENDERER

export interface UseRendererColoringStateOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    rendId: number | null
    /** Default 'renderer' for back-compat with non-shell callers. */
    targetKind?: ColoringTargetKind
}

export interface UseRendererColoringStateResult {
    state: GetRendererColoringStateResult | null
    refetch: () => void
}

const EMPTY_STATE: GetRendererColoringStateResult = {
    ok: false,
    className: '',
    defaultColor: '',
    paintEntries: [],
}

/**
 * Fetch + auto-refresh the coloring state for a single renderer.
 *
 * Returns `null` until the first fetch resolves; subsequent state is the
 * worker's `getRendererColoringState` result. Auto-refetches on
 * `SEM_RENDERER` events scoped to the active scene.
 */
export function useRendererColoringState({
    cm,
    sceneId,
    rendId,
    targetKind = 'renderer',
}: UseRendererColoringStateOptions): UseRendererColoringStateResult {
    const [state, setState] = useState<GetRendererColoringStateResult | null>(null)

    const sceneIdRef = useRef<number | undefined>(sceneId)
    const rendIdRef = useRef<number | null>(rendId)
    const targetKindRef = useRef<ColoringTargetKind>(targetKind)
    sceneIdRef.current = sceneId
    rendIdRef.current = rendId
    targetKindRef.current = targetKind

    const refetch = useCallback(() => {
        const sid = sceneIdRef.current
        const rid = rendIdRef.current
        const tk = targetKindRef.current
        if (!cm || sid === undefined || rid === null) {
            setState(null)
            return
        }
        cm.invokeService('getRendererColoringState', {
            sceneId: sid,
            rendId: rid,
            targetKind: tk,
        })
            .then((res) => {
                setState(res ?? EMPTY_STATE)
            })
            .catch((err: unknown) => {
                console.warn('getRendererColoringState failed:', err)
                setState(EMPTY_STATE)
            })
    }, [cm])

    useEffect(() => {
        refetch()
    }, [cm, sceneId, rendId, targetKind, refetch])

    // Filter the handler to coloring / defaultcolor PROPCHG, plus any
    // ADDED / REMOVING events on the renderer (paint entries are
    // implementation details of the PaintColoring object; their churn
    // surfaces as ADDED / REMOVING events scoped to the parent renderer).
    const handler = useCallback((args: unknown) => {
        const payload = args as { obj?: { propname?: string } } | undefined
        const propname = payload?.obj?.propname
        if (propname === undefined) {
            // Non-PROPCHG event (ADDED / REMOVING) — always refetch.
            refetch()
            return
        }
        if (propname === 'coloring' || propname === 'defaultcolor') {
            refetch()
        }
    }, [refetch])

    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined && rendId !== null,
        category: '',
        srcMask: COLORING_EVENT_MASK,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler,
        debounceMs: REFETCH_DEBOUNCE_MS,
    })

    return { state, refetch }
}
