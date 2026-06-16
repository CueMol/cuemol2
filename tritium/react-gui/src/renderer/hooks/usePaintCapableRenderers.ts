/**
 * @file hooks/usePaintCapableRenderers.ts
 * @description Live list of paint-capable renderers for the Coloring panel's
 * renderer selector.
 *
 * Fetches the list from the worker via `listPaintCapableRenderers` and
 * subscribes to the CueMol event manager so the list refreshes whenever
 * the scene gains/loses an object or renderer, or a renderer's name
 * changes. The "paint-capable" gate is the worker-side
 * `paint_coloring_filter` equivalent (renderer exposes a `coloring`
 * property).
 */

import { useRef } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { PaintCapableRendererEntry } from '../worker/server/services/rendererColoring.service'
import { SEM_OBJECT, SEM_RENDERER, SEM_ANY } from '../event'
import { useLiveFetch } from './useLiveFetch'

const SCENE_EVENT_MASK = SEM_OBJECT | SEM_RENDERER
const REFETCH_DEBOUNCE_MS = 30
const EMPTY: PaintCapableRendererEntry[] = []

export interface UsePaintCapableRenderersOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
}

export interface UsePaintCapableRenderersResult {
    renderers: PaintCapableRendererEntry[]
    refetch: () => void
}

/**
 * Fetch + auto-refresh paint-capable renderers for the active scene.
 *
 * The list is recomputed on a 30ms debounce after object/renderer events
 * to coalesce bursts (e.g. PDB load).
 */
export function usePaintCapableRenderers({
    cm,
    sceneId,
}: UsePaintCapableRenderersOptions): UsePaintCapableRenderersResult {
    const sceneIdRef = useRef<number | undefined>(sceneId)
    sceneIdRef.current = sceneId

    const { state: renderers, refetch } = useLiveFetch<PaintCapableRendererEntry[]>({
        cm,
        initial: EMPTY,
        fallback: EMPTY,
        fetch: () => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return null
            return cm
                .invokeService('listPaintCapableRenderers', { sceneId: sid })
                .then((res) => (res?.ok ? res.renderers : EMPTY))
                .catch((err: unknown) => {
                    console.warn('listPaintCapableRenderers failed:', err)
                    return EMPTY
                })
        },
        fetchDeps: [sceneId],
        listeners: [
            {
                enabled: sceneId !== undefined,
                srcMask: SCENE_EVENT_MASK,
                evtMask: SEM_ANY,
                scopeId: sceneId ?? -1,
                debounceMs: REFETCH_DEBOUNCE_MS,
            },
        ],
    })

    return { renderers, refetch }
}
