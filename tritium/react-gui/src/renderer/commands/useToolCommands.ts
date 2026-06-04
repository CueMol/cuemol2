/**
 * @file commands/useToolCommands.ts
 * @description Registers molecule-editing tool dialog triggers (UXP
 * `tools/*` dialogs reached from the Edit menu). Currently:
 *   - `UiChangeChainIdDialog` -> `ChangeChainIdDialog` (UXP `chg_chname`).
 *
 * Each command resolves the active scene, opens the dialog (which owns its
 * own commit via a worker service), and returns. Future tool dialogs
 * (Change residue index, Merge molecule, ...) register here too.
 */

import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { useShowChangeChainIdDialog } from '../components/dialogs/ChangeChainIdDialogProvider'

interface UseToolCommandsOptions {
    cm: AsyncCueMol | null
    getActiveSceneInfo: () => { scene_uid: number; view_id: number } | null | undefined
}

export function useToolCommands({
    cm,
    getActiveSceneInfo,
}: UseToolCommandsOptions): void {
    const showChangeChainIdDialog = useShowChangeChainIdDialog()

    useRegisterCommand(CmdId.UiChangeChainIdDialog, () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        void showChangeChainIdDialog({ sceneId: info.scene_uid })
    })
}
