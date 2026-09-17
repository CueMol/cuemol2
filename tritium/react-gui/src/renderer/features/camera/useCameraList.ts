/**
 * @file features/camera/useCameraList.ts
 * @description The Camera pane's rows: the scene's named cameras, in the
 * order the user arranged them.
 *
 * Keeps itself current from the CueMol event manager rather than by refetching
 * after its own calls, so a camera added by a script, an undo, or a scene load
 * shows up too. A reorder arrives as a burst of `cameraChanged` (one per moved
 * camera), which the debounce collapses into a single refetch.
 */

import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { CameraEntry } from '@renderer/worker/shared/cameraTypes'
import { SEM_ANY, SEM_CAMERA, SEM_CHANGED, SEM_SCENE } from '@renderer/event'
import { useLiveFetch } from '@renderer/hooks/cuemol/useLiveFetch'
import { useLatestRef } from '@renderer/hooks/react/useLatestRef'
import { EVENT_BURST_DEBOUNCE_MS } from '@renderer/utils/timing'
import { listCameras } from './cameraOps'

const EMPTY: CameraEntry[] = []

export interface UseCameraListResult {
    cameras: CameraEntry[]
    refetch: () => void
}

export function useCameraList(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
): UseCameraListResult {
    const sceneIdRef = useLatestRef(sceneId)

    const { state, refetch } = useLiveFetch<CameraEntry[]>({
        cm,
        initial: EMPTY,
        fallback: EMPTY,
        fetch: () => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return null
            return listCameras(cm, sid)
        },
        onError: (err) => console.warn('listCameras failed:', err),
        fetchDeps: [sceneId],
        listeners: [
            // Camera added / changed / removing. `cameraRemoving` fires BEFORE
            // the camera leaves the scene, so the debounce is what makes the
            // refetch see the list without it.
            {
                enabled: sceneId !== undefined,
                srcMask: SEM_CAMERA,
                evtMask: SEM_ANY,
                scopeId: sceneId ?? -1,
                debounceMs: EVENT_BURST_DEBOUNCE_MS,
            },
            // Whole-scene changes: a loaded or cleared scene replaces the list.
            {
                enabled: sceneId !== undefined,
                srcMask: SEM_SCENE,
                evtMask: SEM_CHANGED,
                scopeId: sceneId ?? -1,
                debounceMs: EVENT_BURST_DEBOUNCE_MS,
            },
        ],
    })

    return { cameras: state, refetch }
}
