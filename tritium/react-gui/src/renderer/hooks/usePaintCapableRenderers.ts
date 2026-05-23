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

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { PaintCapableRendererEntry } from '../worker/server/services/rendererColoring.service'
import { SEM_OBJECT, SEM_RENDERER, SEM_ANY } from '../event'
import { useCueMolEventListener } from './useCueMolEventListener'

const SCENE_EVENT_MASK = SEM_OBJECT | SEM_RENDERER
const REFETCH_DEBOUNCE_MS = 30

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
    const [renderers, setRenderers] = useState<PaintCapableRendererEntry[]>([])

    const sceneIdRef = useRef<number | undefined>(sceneId)
    sceneIdRef.current = sceneId

    const refetch = useCallback(() => {
        const sid = sceneIdRef.current
        if (!cm || sid === undefined) {
            setRenderers([])
            return
        }
        cm.invokeService('listPaintCapableRenderers', { sceneId: sid })
            .then((res) => {
                setRenderers(res?.ok ? res.renderers : [])
            })
            .catch((err: unknown) => {
                console.warn('listPaintCapableRenderers failed:', err)
                setRenderers([])
            })
    }, [cm])

    useEffect(() => {
        refetch()
    }, [cm, sceneId, refetch])

    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined,
        category: '',
        srcMask: SCENE_EVENT_MASK,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: refetch,
        debounceMs: REFETCH_DEBOUNCE_MS,
    })

    return { renderers, refetch }
}
