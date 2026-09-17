/**
 * @file features/camera/cameraOps.ts
 * @description Worker calls behind the camera commands, as plain async
 * functions.
 *
 * Cameras are addressed by name at the worker boundary: a registered camera
 * has no uid and the Scene API keys on the name (ADR-0005). These are plain
 * functions rather than a hook because the Camera pane and the command
 * handlers both call them, and nothing here needs React state.
 */

import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { CameraEntry } from '@renderer/worker/shared/cameraTypes'
import { readSceneClip, writeSceneClip } from '@renderer/hooks/sceneTree/sceneClipIo'

/** The scene's cameras in display order (the internal `__current` excluded). */
export async function listCameras(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
): Promise<CameraEntry[]> {
    if (!cm || sceneId === undefined) return []
    const res = await cm.invokeService('listCameras', { sceneId })
    return res?.ok ? res.cameras : []
}

/**
 * Save the live view as a camera of that name. An existing name is
 * overwritten (UXP parity); the returned name is the one created.
 */
export async function createCamera(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    viewId: number,
    name: string,
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const res = await cm.invokeService('createCamera', { sceneId, viewId, name })
    return res?.ok === true
}

export async function destroyCamera(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    name: string,
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const res = await cm.invokeService('destroyCamera', { sceneId, name })
    return res?.ok === true
}

export async function renameCamera(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    oldName: string,
    newName: string,
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const res = await cm.invokeService('renameCamera', { sceneId, oldName, newName })
    return res?.ok === true
}

export async function saveViewToCamera(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    viewId: number,
    name: string,
    withVisFlags: boolean,
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const res = await cm.invokeService('saveViewToCamera', { sceneId, viewId, name, withVisFlags })
    return res?.ok === true
}

export async function applyCameraToView(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    viewId: number,
    name: string,
    withVisFlags: boolean,
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const res = await cm.invokeService('applyCameraToView', { sceneId, viewId, name, withVisFlags })
    return res?.ok === true
}

export async function clearCameraVisFlags(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    name: string,
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const res = await cm.invokeService('clearCameraVisFlags', { sceneId, name })
    return res?.ok === true
}

export async function loadCameraFromFile(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    viewId: number,
    path: string,
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const res = await cm.invokeService('loadCameraFromFile', { sceneId, viewId, path })
    return res?.ok === true
}

export async function saveCameraToFile(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    name: string,
    path: string,
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const res = await cm.invokeService('saveCameraToFile', { sceneId, name, path })
    return res?.ok === true
}

/** Write to the camera's own source file; `saved: false` means it has none. */
export async function saveCameraToCurrentSrc(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    name: string,
): Promise<{ ok: boolean; saved: boolean }> {
    if (!cm || sceneId === undefined) return { ok: false, saved: false }
    const res = await cm.invokeService('saveCameraToCurrentSrc', { sceneId, name })
    return { ok: res?.ok === true, saved: res?.saved === true }
}

export async function reloadCameraFromSrc(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    name: string,
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const res = await cm.invokeService('reloadCameraFromSrc', { sceneId, name })
    return res?.ok === true
}

/** Put a camera on the OS clipboard (interop with CueMol2 -- ADR-0005). */
export async function copyCamera(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    name: string,
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const res = await cm.invokeService('copyNode', {
        sceneId,
        // Cameras have no uid; the worker keys on cameraName for this type.
        nodeId: -1,
        nodeType: 'camera',
        cameraName: name,
    })
    return writeSceneClip(res)
}

/** Paste the clipboard's camera into the scene (refuses any other kind). */
export async function pasteCamera(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const clip = await readSceneClip()
    if (!clip || clip.kind !== 'camera') return false
    const res = await cm.invokeService('pasteNode', { sceneId, ...clip })
    return res?.ok === true
}

/** Persist the pane's row order (the complete list, top row first). */
export async function reorderCameras(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    names: string[],
): Promise<boolean> {
    if (!cm || sceneId === undefined) return false
    const res = await cm.invokeService('reorderCameras', { sceneId, names })
    return res?.ok === true
}
