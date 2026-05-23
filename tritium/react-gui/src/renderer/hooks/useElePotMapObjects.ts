/**
 * @file hooks/useElePotMapObjects.ts
 * @description Live list of ElePotMap objects in the active scene, used by
 * the Coloring panel's Elepot deck to populate its potential-object selector.
 *
 * Fetches via `listElePotMapObjects` and refetches on SEM_OBJECT events so
 * the dropdown stays in sync when a map object is added or removed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { ElePotMapObjectEntry } from '../worker/server/services/rendererColoring.service'
import { SEM_OBJECT, SEM_ANY } from '../event'
import { useCueMolEventListener } from './useCueMolEventListener'

const REFETCH_DEBOUNCE_MS = 30

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
    const [objects, setObjects] = useState<ElePotMapObjectEntry[]>([])

    const sceneIdRef = useRef<number | undefined>(sceneId)
    sceneIdRef.current = sceneId

    const refetch = useCallback(() => {
        const sid = sceneIdRef.current
        if (!cm || sid === undefined || !enabled) {
            setObjects([])
            return
        }
        cm.invokeService('listElePotMapObjects', { sceneId: sid })
            .then((res) => {
                setObjects(res?.ok ? res.objects : [])
            })
            .catch((err: unknown) => {
                console.warn('listElePotMapObjects failed:', err)
                setObjects([])
            })
    }, [cm, enabled])

    useEffect(() => {
        refetch()
    }, [cm, sceneId, enabled, refetch])

    useCueMolEventListener({
        cm,
        enabled: enabled && sceneId !== undefined,
        category: '',
        srcMask: SEM_OBJECT,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: refetch,
        debounceMs: REFETCH_DEBOUNCE_MS,
    })

    return { objects, refetch }
}
