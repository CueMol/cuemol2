/**
 * @file hooks/useDensityMapPanel.ts
 * @description Live data source for `DensityMapPane`'s widget readout.
 *
 * Scoped to a single map renderer (`rendId`) chosen externally
 * (typically by the renderer dropdown driving local React state). The
 * hook fetches `getMapRendererState` and auto-refetches when CueMol
 * fires SEM_RENDERER events that may have touched any driven property
 * (UXP `denmap.onPropChanged` parity), as well as SEM_OBJECT / SEM_SCENE
 * events that may invalidate the underlying renderer.
 *
 * Renderer enumeration (the dropdown items) is owned by
 * `DensityMapPane`; this hook only concerns itself with the
 * widget-driving state for the selected renderer.
 */

import { useRef } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type {
    MapRendererState,
} from '../worker/server/services/densityMapPanelOps.service'
import {
    SEM_OBJECT,
    SEM_RENDERER,
    SEM_SCENE,
    SEM_ANY,
} from '../event'
import { useLiveFetch } from './useLiveFetch'

export interface UseDensityMapPanelOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    /** Currently-selected map renderer uid. */
    rendId: number | undefined
}

export interface UseDensityMapPanelResult {
    state: MapRendererState | null
    refetch: () => void
}

export function useDensityMapPanel(
    opts: UseDensityMapPanelOptions,
): UseDensityMapPanelResult {
    const { cm, sceneId, rendId } = opts

    // Keep latest sceneId / rendId in refs so event-driven refetches
    // do not force resubscribe.
    const sceneIdRef = useRef(sceneId)
    sceneIdRef.current = sceneId
    const rendIdRef = useRef(rendId)
    rendIdRef.current = rendId

    const { state, refetch: fetchState } = useLiveFetch<MapRendererState | null>({
        cm,
        initial: null,
        fallback: null,
        fetch: () => {
            const sid = sceneIdRef.current
            const rid = rendIdRef.current
            if (!cm || sid === undefined || rid === undefined) return null
            return cm
                .invokeService('getMapRendererState', { sceneId: sid, rendId: rid })
                .then((res) => res?.state ?? null)
                .catch((err: unknown) => {
                    console.warn('getMapRendererState failed:', err)
                    return null
                })
        },
        fetchDeps: [sceneId, rendId],
        listeners: [
            // SEM_RENDERER events (any prop change touches the widget snapshot
            // we hand to the panel).
            {
                enabled: sceneId !== undefined && rendId !== undefined,
                srcMask: SEM_RENDERER,
                evtMask: SEM_ANY,
                scopeId: sceneId ?? -1,
                debounceMs: 30,
            },
            // Object events (add / remove / property change) -- the renderer
            // may have churned along with its parent map object.
            {
                enabled: sceneId !== undefined && rendId !== undefined,
                srcMask: SEM_OBJECT,
                evtMask: SEM_ANY,
                scopeId: sceneId ?? -1,
                debounceMs: 30,
            },
            // Scene-wide events (load / clear) -- everything may have churned.
            {
                enabled: sceneId !== undefined,
                srcMask: SEM_SCENE,
                evtMask: SEM_ANY,
                scopeId: sceneId ?? -1,
                debounceMs: 30,
            },
        ],
    })

    return { state, refetch: fetchState }
}
