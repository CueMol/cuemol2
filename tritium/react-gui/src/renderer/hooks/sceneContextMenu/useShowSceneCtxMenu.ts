/**
 * @file hooks/sceneContextMenu/useShowSceneCtxMenu.ts
 * @description Showing a scene context menu on the right surface for the
 * platform, and returning what the user picked.
 *
 * macOS pops the native menu the main process builds; Windows / Linux render
 * the same shared template with the React MenuPanel so the look matches the
 * menu-bar dropdowns. Both the scene tree and the Camera pane raise camera and
 * node menus, so this switch lives in one place.
 */

import { useCallback } from 'react'
import type { SceneCtxAction, SceneCtxMenuPayload } from '@shared/types/sceneCtxMenu'
import { IPC } from '@shared/ipcChannels'
import { buildTemplate } from '@shared/sceneCtxMenu/sceneCtxTemplates'
import { useShowContextMenu } from '@renderer/shell/menu/ContextMenuProvider'

/** Peek at the CueMol clipboard so Paste items can be enabled correctly. */
export async function peekClipboardKind(): Promise<
    'object' | 'renderer' | 'style' | 'camera' | null
> {
    // Peek rather than read: the payload may be megabytes and the menu only
    // needs to know what kind is there. Asked on every menu open, so a copy
    // made in another app (or another CueMol instance) is seen immediately.
    // Paint rows share the clipboard but are not a scene node, so they read
    // as "nothing to paste" here.
    try {
        const r = await window.electronAPI?.invoke(IPC.CLIPBOARD_CUEMOL_PEEK)
        return r && r.kind !== 'paint' ? r.kind : null
    } catch (err) {
        console.warn('clipboard peek failed:', err)
        return null
    }
}

export function useShowSceneCtxMenu(): (
    payload: SceneCtxMenuPayload,
) => Promise<SceneCtxAction | null> {
    const showContextMenu = useShowContextMenu()
    return useCallback(
        async (payload: SceneCtxMenuPayload): Promise<SceneCtxAction | null> => {
            const api = window.electronAPI
            if (api?.platform === 'darwin') {
                return await api.invoke(IPC.SCENE_CTX_SHOW, payload)
            }
            return await showContextMenu(buildTemplate(payload), { x: payload.x, y: payload.y })
        },
        [showContextMenu],
    )
}
