/**
 * @file hooks/sceneTree/useSceneTreeCameraOps.ts
 * @description Camera operations for `useSceneTree`. Cameras are
 * keyed by name; these callbacks dispatch directly to the worker without a
 * tree lookup.
 */

import { useCallback, type MutableRefObject } from 'react'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'

export interface SceneTreeCameraOps {
    createCamera: (viewId: number, name: string) => Promise<boolean>
    renameCamera: (oldName: string, newName: string) => Promise<boolean>
    saveViewToCamera: (
        viewId: number, name: string, withVisFlags: boolean,
    ) => Promise<boolean>
    applyCameraToView: (
        viewId: number, name: string, withVisFlags: boolean,
    ) => Promise<boolean>
    clearCameraVisFlags: (name: string) => Promise<boolean>
    loadCameraFromFile: (viewId: number, path: string) => Promise<boolean>
    saveCameraToFile: (name: string, path: string) => Promise<boolean>
    saveCameraToCurrentSrc: (
        name: string,
    ) => Promise<{ ok: boolean; saved: boolean }>
    reloadCameraFromSrc: (name: string) => Promise<boolean>
}

export function useSceneTreeCameraOps(
    cm: AsyncCueMol | null,
    sceneIdRef: MutableRefObject<number | undefined>,
): SceneTreeCameraOps {
    const createCamera = useCallback(
        async (viewId: number, name: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('createCamera', {
                sceneId: sid, viewId, name,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    const renameCamera = useCallback(
        async (oldName: string, newName: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('renameCamera', {
                sceneId: sid, oldName, newName,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    const saveViewToCamera = useCallback(
        async (viewId: number, name: string, withVisFlags: boolean): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('saveViewToCamera', {
                sceneId: sid, viewId, name, withVisFlags,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    const applyCameraToView = useCallback(
        async (viewId: number, name: string, withVisFlags: boolean): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('applyCameraToView', {
                sceneId: sid, viewId, name, withVisFlags,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    const clearCameraVisFlags = useCallback(
        async (name: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('clearCameraVisFlags', {
                sceneId: sid, name,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    const loadCameraFromFile = useCallback(
        async (viewId: number, path: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('loadCameraFromFile', {
                sceneId: sid, viewId, path,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    const saveCameraToFile = useCallback(
        async (name: string, path: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('saveCameraToFile', {
                sceneId: sid, name, path,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    const saveCameraToCurrentSrc = useCallback(
        async (name: string): Promise<{ ok: boolean; saved: boolean }> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return { ok: false, saved: false }
            const res = await cm.invokeService('saveCameraToCurrentSrc', {
                sceneId: sid, name,
            })
            return { ok: res?.ok === true, saved: res?.saved === true }
        },
        [cm, sceneIdRef],
    )

    const reloadCameraFromSrc = useCallback(
        async (name: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('reloadCameraFromSrc', {
                sceneId: sid, name,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    return {
        createCamera,
        renameCamera,
        saveViewToCamera,
        applyCameraToView,
        clearCameraVisFlags,
        loadCameraFromFile,
        saveCameraToFile,
        saveCameraToCurrentSrc,
        reloadCameraFromSrc,
    }
}
