/**
 * @file hooks/sceneTree/sceneClipIo.ts
 * @description Moving a serialized scene node between the worker and the OS
 * clipboard, which the main process owns.
 *
 * Shared by the scene tree and the Camera pane: both copy a node the worker
 * serialized and paste whatever is on the clipboard, and the kind check that
 * keeps paint rows out belongs in one place.
 */

import { IPC } from '@shared/ipcChannels'

/** The scene-node kinds that travel on the CueMol clipboard. */
export type SceneClipKind = 'object' | 'renderer' | 'style' | 'camera'

/** What a copy service returns for the caller to put on the clipboard. */
export interface SceneClipPayload {
    ok: boolean
    kind: SceneClipKind | null
    form?: 'single' | 'rendArray'
    bytes?: Uint8Array
}

/**
 * Hand a freshly serialized node to the main process, which owns the OS
 * clipboard. Copy is only "done" once the payload is actually on the
 * clipboard, so a failed write reports failure rather than leaving the user
 * with a Paste that silently does the wrong thing.
 */
export async function writeSceneClip(res: SceneClipPayload | undefined): Promise<boolean> {
    if (res?.ok !== true || !res.kind || !res.bytes) return false
    const api = window.electronAPI
    if (!api) return false
    try {
        const w = await api.invoke(IPC.CLIPBOARD_CUEMOL_WRITE, {
            kind: res.kind,
            form: res.form,
            bytes: res.bytes,
        })
        return w?.ok === true
    } catch (err) {
        console.warn('clipboard write failed:', err)
        return false
    }
}

/**
 * Pull a scene-node payload off the OS clipboard. Paint rows live on the
 * same clipboard but are not a scene node, so they are refused here.
 */
export async function readSceneClip(): Promise<
    { kind: SceneClipKind; form: 'single' | 'rendArray'; bytes: Uint8Array } | null
> {
    const api = window.electronAPI
    if (!api) return null
    try {
        const clip = await api.invoke(IPC.CLIPBOARD_CUEMOL_READ)
        if (!clip || clip.kind === 'paint') return null
        return clip
    } catch (err) {
        console.warn('clipboard read failed:', err)
        return null
    }
}
