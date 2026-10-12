/**
 * @file features/actions/useActionSteps.ts
 * @description The undo steps of the active scene, kept current.
 *
 * The worker pushes `actions-changed` whenever a scene's steps move -- a
 * commit, an undo or redo from anywhere (the toolbar, the console, an agent),
 * a clear -- so that push is the refresh. A scene event refetches too: a
 * scene load replaces the stack without a commit, and the steps are brought
 * in line with it when they are read.
 */

import { useEffect } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { ActionStepView } from '@renderer/worker/shared/actionTypes'
import { SEM_ANY, SEM_SCENE } from '@renderer/event'
import { useLiveFetch } from '@renderer/hooks/cuemol/useLiveFetch'
import { useLatestRef } from '@renderer/hooks/react/useLatestRef'
import { EVENT_BURST_DEBOUNCE_MS } from '@renderer/utils/timing'
import { getActionSteps } from './actionOps'

const EMPTY: ActionStepView[] = []

export interface UseActionStepsResult {
    steps: ActionStepView[]
    refetch: () => void
}

export function useActionSteps(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
): UseActionStepsResult {
    const sceneIdRef = useLatestRef(sceneId)

    const { state, refetch } = useLiveFetch<ActionStepView[]>({
        cm,
        initial: EMPTY,
        fallback: EMPTY,
        fetch: () => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return null
            return getActionSteps(cm, sid)
        },
        onError: (err) => console.warn('getActionSteps failed:', err),
        fetchDeps: [sceneId],
        listeners: [
            {
                enabled: sceneId !== undefined,
                srcMask: SEM_SCENE,
                evtMask: SEM_ANY,
                scopeId: sceneId ?? -1,
                debounceMs: EVENT_BURST_DEBOUNCE_MS,
            },
        ],
    })

    useEffect(() => {
        if (!cm || sceneId === undefined) return
        return cm.subscribeActionsChanged((changed) => {
            if (changed === sceneId) refetch()
        })
    }, [cm, sceneId, refetch])

    return { steps: state, refetch }
}
