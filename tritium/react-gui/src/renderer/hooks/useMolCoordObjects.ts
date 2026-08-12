/**
 * @file hooks/useMolCoordObjects.ts
 * @description Live list of molecule (MolCoord) objects in the active scene,
 * used by the Coloring panel's "Coloring mol" selector shown in molecule
 * colormode (MOLFANC nearest-atom coloring).
 *
 * Fetches via `listSceneObjects` + the client-side `objectFilters.molCoord`
 * filter and refetches on SEM_OBJECT events so the dropdown stays in sync
 * when a molecule is added, renamed or removed.
 */

import { useRef } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { SceneObjectEntry } from '../worker/server/services/listSceneObjects.service'
import { objectFilters } from '../h3-kit/ObjectSelect'
import { SEM_OBJECT, SEM_ANY } from '../event'
import { useLiveFetch } from './useLiveFetch'

const EMPTY: SceneObjectEntry[] = []

const REFETCH_DEBOUNCE_MS = 30

export interface UseMolCoordObjectsOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    /** Skip the subscription + fetch entirely when false (selector hidden). */
    enabled: boolean
}

export interface UseMolCoordObjectsResult {
    objects: SceneObjectEntry[]
    refetch: () => void
}

/**
 * Fetch + auto-refresh MolCoord objects in the active scene.
 *
 * Returns an empty array until the first fetch resolves or when `enabled`
 * is false. The list is recomputed on a 30ms debounce after object events
 * to coalesce bursts.
 */
export function useMolCoordObjects({
    cm,
    sceneId,
    enabled,
}: UseMolCoordObjectsOptions): UseMolCoordObjectsResult {
    const sceneIdRef = useRef<number | undefined>(sceneId)
    sceneIdRef.current = sceneId
    const enabledRef = useRef(enabled)
    enabledRef.current = enabled

    const { state: objects, refetch } = useLiveFetch<SceneObjectEntry[]>({
        cm,
        initial: EMPTY,
        fallback: EMPTY,
        fetch: () => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined || !enabledRef.current) return null
            return cm
                .invokeService('listSceneObjects', { sceneId: sid })
                .then((res) =>
                    (res?.objects ?? EMPTY).filter((o: SceneObjectEntry) =>
                        objectFilters.molCoord(o),
                    ),
                )
                .catch((err: unknown) => {
                    console.warn('listSceneObjects failed:', err)
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
                debounceMs: REFETCH_DEBOUNCE_MS,
            },
        ],
    })

    return { objects, refetch }
}
