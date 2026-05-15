/**
 * @file hooks/sceneTree/useSceneTreeStyleOps.ts
 * @description Style-set operations (Phase 5c) plus scene-level operations
 * (background color, color proofing) for `useSceneTree`. These callbacks
 * dispatch directly to the worker without a tree lookup.
 */

import { useCallback, type MutableRefObject } from 'react'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'

export interface SceneTreeStyleOps {
    /** Phase 5c style ops. */
    createStyleSet: (name: string) => Promise<{ ok: boolean; newId: number }>
    toggleStyleSetReadOnly: (
        nodeId: number,
        scopeId: number,
    ) => Promise<{ ok: boolean; readonly: boolean }>
    loadStyleSetFromFile: (path: string) => Promise<boolean>
    saveStyleSetToFile: (
        nodeId: number,
        scopeId: number,
        path: string,
    ) => Promise<boolean>
    saveStyleSetToCurrentSrc: (
        nodeId: number,
        scopeId: number,
    ) => Promise<{ ok: boolean; saved: boolean }>
    /** Set the scene's background color from the scene ctx menu. */
    setSceneBackgroundColor: (color: 'white' | 'black') => Promise<boolean>
    /** Toggle the scene's color-proofing flag. */
    toggleSceneColorProofing: () => Promise<boolean>
}

export function useSceneTreeStyleOps(
    cm: AsyncCueMol | null,
    sceneIdRef: MutableRefObject<number | undefined>,
): SceneTreeStyleOps {
    const createStyleSet = useCallback(
        async (name: string): Promise<{ ok: boolean; newId: number }> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return { ok: false, newId: -1 }
            const res = await cm.invokeService('createStyleSet', {
                sceneId: sid, name,
            })
            return { ok: res?.ok === true, newId: res?.newId ?? -1 }
        },
        [cm, sceneIdRef],
    )

    const toggleStyleSetReadOnly = useCallback(
        async (nodeId: number, scopeId: number): Promise<{ ok: boolean; readonly: boolean }> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return { ok: false, readonly: false }
            const res = await cm.invokeService('toggleStyleSetReadOnly', {
                sceneId: sid, scopeId, styleSetId: nodeId,
            })
            return { ok: res?.ok === true, readonly: res?.readonly === true }
        },
        [cm, sceneIdRef],
    )

    const loadStyleSetFromFile = useCallback(
        async (path: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('loadStyleSetFromFile', {
                sceneId: sid, path,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    const saveStyleSetToFile = useCallback(
        async (nodeId: number, scopeId: number, path: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('saveStyleSetToFile', {
                sceneId: sid, scopeId, styleSetId: nodeId, path,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    const saveStyleSetToCurrentSrc = useCallback(
        async (nodeId: number, scopeId: number): Promise<{ ok: boolean; saved: boolean }> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return { ok: false, saved: false }
            const res = await cm.invokeService('saveStyleSetToCurrentSrc', {
                sceneId: sid, scopeId, styleSetId: nodeId,
            })
            return { ok: res?.ok === true, saved: res?.saved === true }
        },
        [cm, sceneIdRef],
    )

    const setSceneBackgroundColor = useCallback(
        async (color: 'white' | 'black'): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('setSceneBgColor', {
                sceneId: sid,
                colorName: color,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    const toggleSceneColorProofing = useCallback(
        async (): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('toggleSceneColorProofing', {
                sceneId: sid,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    return {
        createStyleSet,
        toggleStyleSetReadOnly,
        loadStyleSetFromFile,
        saveStyleSetToFile,
        saveStyleSetToCurrentSrc,
        setSceneBackgroundColor,
        toggleSceneColorProofing,
    }
}
