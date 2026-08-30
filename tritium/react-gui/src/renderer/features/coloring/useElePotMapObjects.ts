/**
 * @file features/coloring/useElePotMapObjects.ts
 * @description Live list of ElePotMap objects in the active scene, used by
 * the Coloring panel's Elepot deck to populate its potential-object selector.
 *
 * Fetches via `listElePotMapObjects` and refetches on SEM_OBJECT events so
 * the dropdown stays in sync when a map object is added or removed.
 */

import { useRef } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { ElePotMapObjectEntry } from '@renderer/worker/server/services/coloring/coloring.service'
import { SEM_OBJECT, SEM_ANY } from '@renderer/event'
import { useLiveFetch } from '@renderer/hooks/cuemol/useLiveFetch'
import { EVENT_BURST_DEBOUNCE_MS } from '@renderer/utils/timing'

const EMPTY: ElePotMapObjectEntry[] = []

export interface UseElePotMapObjectsOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    /** Skip the subscription + fetch entirely when false (Elepot deck hidden). */
    enabled: boolean
}

export interface UseElePotMapObjectsResult {
    objects: ElePotMapObjectEntry[]
    refetch: () => void
}

/**
 * Fetch + auto-refresh ElePotMap objects in the active scene.
 *
 * Returns an empty array until the first fetch resolves or when `enabled`
 * is false. The list is recomputed on a 30ms debounce after object events
 * to coalesce bursts.
 */
export function useElePotMapObjects({
    cm,
    sceneId,
    enabled,
}: UseElePotMapObjectsOptions): UseElePotMapObjectsResult {
    const sceneIdRef = useRef<number | undefined>(sceneId)
    sceneIdRef.current = sceneId
    const enabledRef = useRef(enabled)
    enabledRef.current = enabled

    const { state: objects, refetch } = useLiveFetch<ElePotMapObjectEntry[]>({
        cm,
        initial: EMPTY,
        fallback: EMPTY,
        fetch: () => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined || !enabledRef.current) return null
            return cm
                .invokeService('listElePotMapObjects', { sceneId: sid })
                .then((res) => (res?.ok ? res.objects : EMPTY))
                .catch((err: unknown) => {
                    console.warn('listElePotMapObjects failed:', err)
                    return EMPTY
                })
        },
        fetchDeps: [sceneId, enabled],
        listeners: [
            {
                enabled: enabled && sceneId !== undefined,
                srcMask: SEM_OBJECT,
                evtMask: SEM_ANY,
                scopeId: sceneId ?? -1,
                debounceMs: EVENT_BURST_DEBOUNCE_MS,
            },
        ],
    })

    return { objects, refetch }
}
