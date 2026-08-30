/**
 * @file hooks/sceneTree/useSceneTreeStyleOps.ts
 * @description Style-set operations for `useSceneTree`. These callbacks
 * dispatch directly to the worker without a tree lookup.
 *
 * The scene's background colour and colour-proofing flag used to live here
 * too, for the scene row's context menu. They were a second implementation
 * of what the Scene menu already did, and the copy here did not tell the
 * native menu about the change, so its radio items went stale. Both are now
 * the `SceneBgWhite` / `SceneBgBlack` / `SceneColorProof` commands, which the
 * context menu dispatches like every other entry.
 */

import { useCallback, type MutableRefObject, useMemo} from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'

export interface SceneTreeStyleOps {
    /** Style-set ops. */
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

    /**
     * Style-set operations, memoized for the same reason as the node ops: the
     * bundle they are spread into is handed out as context.
     */
    return useMemo(
        () => ({
            createStyleSet,
            toggleStyleSetReadOnly,
            loadStyleSetFromFile,
            saveStyleSetToFile,
            saveStyleSetToCurrentSrc,
        }),
        [
            createStyleSet, toggleStyleSetReadOnly, loadStyleSetFromFile,
            saveStyleSetToFile, saveStyleSetToCurrentSrc,
        ],
    )
}
