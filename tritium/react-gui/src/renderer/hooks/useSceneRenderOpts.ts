/**
 * @file hooks/useSceneRenderOpts.ts
 * @description Live data source for `RenderingPane`'s scene rendering/display
 * controls: ambient occlusion (GTAO), post-process anti-aliasing, background
 * colour, and CMYK colour proofing.
 *
 * Fetches `getSceneRenderOpts` for the active scene and auto-refetches on
 * SEM_SCENE property-change events (undo/redo, scripts, scene load) so the
 * fields stay live. Mutations apply optimistically to local state and
 * round-trip through `setSceneRenderOpts`.
 *
 * Discrete edits (toggle / select / colour / text) go through `setProp`
 * (`mode: 'single'` -> one undo step). A slider drag is bracketed so the whole
 * drag is one undo step: `beginEdit` opens the txn, `liveEdit` previews each
 * frame, and `endEdit` commits (or `cancelEdit` rolls back). While a drag is in
 * progress the self-fired PROPCHG bursts are ignored (the local optimistic
 * value is authoritative); the trailing `endEdit`/`cancelEdit` refetch syncs the
 * clamped truth. Mirrors `useViewXform`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { SceneRenderOptsState } from '../worker/server/services/sceneRenderOpts.service'
import { SEM_SCENE, SEM_PROPCHG } from '../event'
import { useCueMolEventListener } from './useCueMolEventListener'

/** Fields the pane may write (everything in the state). */
export type SceneRenderOptsPatch = Partial<SceneRenderOptsState>

export interface UseSceneRenderOptsOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
}

export interface UseSceneRenderOptsResult {
    state: SceneRenderOptsState | null
    /** Discrete change committed as a single undo step. */
    setProp: (patch: SceneRenderOptsPatch, label?: string) => void
    /** Open a single undo txn for a slider drag (suppresses event refetch). */
    beginEdit: (label: string) => void
    /** Preview a slider frame inside the open drag txn (optimistic). */
    liveEdit: (patch: SceneRenderOptsPatch) => void
    /** Commit the drag txn (one undo step) and reconcile against worker truth. */
    endEdit: (patch: SceneRenderOptsPatch) => void
    /** Roll back the drag txn (Esc / unmount) and reconcile. */
    cancelEdit: () => void
}

export function useSceneRenderOpts(
    opts: UseSceneRenderOptsOptions,
): UseSceneRenderOptsResult {
    const { cm, sceneId } = opts
    const [state, setState] = useState<SceneRenderOptsState | null>(null)

    const stateRef = useRef<SceneRenderOptsState | null>(state)
    stateRef.current = state
    const sceneIdRef = useRef(sceneId)
    sceneIdRef.current = sceneId
    const draggingRef = useRef(false)
    const fetchToken = useRef(0)

    const fetchState = useCallback((): void => {
        const sid = sceneIdRef.current
        if (!cm || sid === undefined) {
            setState(null)
            return
        }
        const token = ++fetchToken.current
        cm.invokeService('getSceneRenderOpts', { sceneId: sid })
            .then((res) => {
                if (token !== fetchToken.current) return
                if (!res?.ok) {
                    setState(null)
                    return
                }
                const { ok: _ok, ...rest } = res
                setState(rest)
            })
            .catch((err: unknown) => {
                if (token !== fetchToken.current) return
                console.warn('getSceneRenderOpts failed:', err)
                setState(null)
            })
    }, [cm])

    // Re-fetch when the active scene changes.
    useEffect(() => {
        fetchState()
    }, [cm, sceneId, fetchState])

    // Live sync: SEM_SCENE property changes (undo/redo, scripts). Skipped
    // mid-drag (local optimistic value wins) to avoid feedback jitter.
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined,
        category: '',
        srcMask: SEM_SCENE,
        evtMask: SEM_PROPCHG,
        scopeId: sceneId ?? -1,
        handler: () => {
            if (draggingRef.current) return
            fetchState()
        },
        debounceMs: 30,
    })

    const send = useCallback(
        (patch: SceneRenderOptsPatch, mode: string, label?: string): void => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return
            cm.invokeService('setSceneRenderOpts', {
                sceneId: sid,
                patch,
                mode: mode as never,
                label,
            }).catch((err: unknown) => {
                console.warn('setSceneRenderOpts failed:', err)
            })
        },
        [cm],
    )

    const optimistic = useCallback((patch: SceneRenderOptsPatch): void => {
        const cur = stateRef.current
        if (cur) setState({ ...cur, ...patch })
    }, [])

    const setProp = useCallback(
        (patch: SceneRenderOptsPatch, label?: string) => {
            optimistic(patch)
            send(patch, 'single', label)
        },
        [optimistic, send],
    )

    const beginEdit = useCallback(
        (label: string) => {
            draggingRef.current = true
            send({}, 'begin', label)
        },
        [send],
    )

    const liveEdit = useCallback(
        (patch: SceneRenderOptsPatch) => {
            optimistic(patch)
            send(patch, 'live')
        },
        [optimistic, send],
    )

    const endEdit = useCallback(
        (patch: SceneRenderOptsPatch) => {
            optimistic(patch)
            send(patch, 'end')
            draggingRef.current = false
            fetchState()
        },
        [optimistic, send, fetchState],
    )

    const cancelEdit = useCallback(() => {
        send({}, 'cancel')
        draggingRef.current = false
        fetchState()
    }, [send, fetchState])

    return { state, setProp, beginEdit, liveEdit, endEdit, cancelEdit }
}
