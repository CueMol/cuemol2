/**
 * @file commands/useEditCommands.ts
 * @description Registers edit-layer commands (save, undo, redo) targeting the active scene.
 */

import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'

interface UseEditCommandsOptions {
    cm: AsyncCueMol | null
    getActiveSceneInfo: () => { scene_uid: number; view_id: number } | null | undefined
    handleSave: () => void
}

export function useEditCommands({
    cm,
    getActiveSceneInfo,
    handleSave,
}: UseEditCommandsOptions): void {

    useRegisterCommand(CmdId.FileSave, () => handleSave())

    useRegisterCommand(CmdId.Undo, async () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        await cm.undo(info.scene_uid)
    })

    useRegisterCommand(CmdId.Redo, async () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        await cm.redo(info.scene_uid)
    })
}
