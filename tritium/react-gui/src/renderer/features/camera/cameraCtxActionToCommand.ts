/**
 * @file features/camera/cameraCtxActionToCommand.ts
 * @description Turn a camera context-menu action into a command.
 *
 * The Camera pane raises the same shared menu templates the scene tree used
 * to (`buildCameraNodeMenu` / `buildCameraRootMenu`), but its rows are camera
 * names, not tree nodes -- so the action resolves against a name here instead
 * of against a `SceneTreeNode`. Pure and synchronous; an action that needs a
 * row returns null when the menu was raised on empty space.
 */

import type { SceneCtxAction } from '@shared/types/sceneCtxMenu'
import type { CommandInvocation } from '@renderer/state/sceneTree/commands/sceneCtxActionToCommand'
import { CmdId } from '@renderer/commands/ids'

/**
 * Build the invocation for `action`, or null when it does not apply.
 *
 * @param name - the camera the menu was raised on, or null for empty space.
 * @remarks `rename` is intentionally absent: it opens the row's inline editor,
 *   which is pane state rather than a command.
 */
export function cameraCtxActionToCommand(
    name: string | null,
    action: SceneCtxAction,
): CommandInvocation | null {
    switch (action.kind) {
        case 'newCamera':
            return { id: CmdId.CameraNew }
        case 'cameraLoad':
            return { id: CmdId.CameraLoadFromFile }
        case 'paste':
            return { id: CmdId.CameraPaste }
        case 'copy':
            return name ? { id: CmdId.CameraCopy, args: { name } } : null
        case 'delete':
            return name ? { id: CmdId.CameraDelete, args: { name } } : null
        case 'cameraReload':
            return name ? { id: CmdId.CameraReload, args: { name } } : null
        case 'cameraSave':
            return name ? { id: CmdId.CameraSave, args: { name } } : null
        case 'cameraSaveAs':
            return name ? { id: CmdId.CameraSaveAs, args: { name } } : null
        case 'cameraSaveFromView':
            return name
                ? { id: CmdId.CameraSaveFromView, args: { name, withVisFlags: action.withVisFlags } }
                : null
        case 'cameraApplyToView':
            return name
                ? { id: CmdId.CameraApplyToView, args: { name, withVisFlags: action.withVisFlags } }
                : null
        case 'cameraEditVisFlags':
            return name ? { id: CmdId.CameraEditVisFlags, args: { name } } : null
        case 'cameraClearVisFlags':
            return name ? { id: CmdId.CameraClearVisFlags, args: { name } } : null
        default:
            return null
    }
}
