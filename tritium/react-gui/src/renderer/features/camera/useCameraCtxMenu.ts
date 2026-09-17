/**
 * @file features/camera/useCameraCtxMenu.ts
 * @description The Camera pane's right-click menu.
 *
 * Reuses the shared camera menu templates: `SceneCtxMenuPayload` identifies a
 * camera by name and visual state only (it never carried a tree id), so the
 * pane can raise the very same menu the scene tree used to, on both the native
 * macOS path and the React one. A right-click on empty space raises the root
 * menu, which offers only what does not need a row.
 */

import { useCallback } from 'react'
import type { SceneCtxMenuPayload } from '@shared/types/sceneCtxMenu'
import type { CameraEntry } from '@renderer/worker/shared/cameraTypes'
import {
    peekClipboardKind,
    useShowSceneCtxMenu,
} from '@renderer/hooks/sceneContextMenu/useShowSceneCtxMenu'
import { useCommands } from '@renderer/commands/CommandRegistry'
import { cameraCtxActionToCommand } from './cameraCtxActionToCommand'

export interface UseCameraCtxMenuOptions {
    /** Open the row's inline rename editor (pane state, not a command). */
    onRename: (name: string) => void
}

export function useCameraCtxMenu({ onRename }: UseCameraCtxMenuOptions): (
    camera: CameraEntry | null,
    x: number,
    y: number,
) => Promise<void> {
    const showMenu = useShowSceneCtxMenu()
    const { dispatch } = useCommands()

    return useCallback(
        async (camera: CameraEntry | null, x: number, y: number): Promise<void> => {
            const payload: SceneCtxMenuPayload = {
                x,
                y,
                nodeType: camera ? 'camera' : 'cameraRoot',
                nodeLabel: camera?.name ?? 'Cameras',
                isVisible: true,
                hasVisibility: false,
                clipboardKind: await peekClipboardKind(),
                cameraInfo: camera
                    ? { src: camera.src, visSize: camera.visSize }
                    : undefined,
            }
            const action = await showMenu(payload)
            if (!action) return
            if (action.kind === 'rename') {
                if (camera) onRename(camera.name)
                return
            }
            const invocation = cameraCtxActionToCommand(camera?.name ?? null, action)
            if (!invocation) return
            await dispatch(
                invocation.id,
                ...((invocation.args === undefined ? [] : [invocation.args]) as [never]),
            )
        },
        [showMenu, dispatch, onRename],
    )
}
