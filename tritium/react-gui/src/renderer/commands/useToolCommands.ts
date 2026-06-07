/**
 * @file commands/useToolCommands.ts
 * @description Registers molecule-editing tool dialog triggers (UXP
 * `tools/*` dialogs reached from the Edit / Tools menus). Currently:
 *   - `UiChangeChainIdDialog` -> `ChangeChainIdDialog` (UXP `chg_chname`).
 *   - `UiDeleteMolDialog` -> `DeleteMolDialog` (UXP `tools/mol_delete`).
 *   - `UiChangeResidueIndexDialog` -> `ChangeResidueIndexDialog` (UXP `tools/chg_resindex`).
 *   - `UiMolSuperpose` -> `MolSuperposeDialog` (UXP `tools/ssm_sup`).
 *
 * Each command resolves the active scene, opens the dialog (which owns its
 * own commit via a worker service), and returns. Future tool dialogs
 * (Change residue index, Merge molecule, ...) register here too.
 */

import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { useShowChangeChainIdDialog } from '../components/dialogs/ChangeChainIdDialogProvider'
import { useShowDeleteMolDialog } from '../components/dialogs/DeleteMolDialogProvider'
import { useShowChangeResidueIndexDialog } from '../components/dialogs/ChangeResidueIndexDialogProvider'
import { useShowMolSuperposeDialog } from '../components/dialogs/MolSuperposeDialogProvider'

interface UseToolCommandsOptions {
    cm: AsyncCueMol | null
    getActiveSceneInfo: () => { scene_uid: number; view_id: number } | null | undefined
}

export function useToolCommands({
    cm,
    getActiveSceneInfo,
}: UseToolCommandsOptions): void {
    const showChangeChainIdDialog = useShowChangeChainIdDialog()
    const showDeleteMolDialog = useShowDeleteMolDialog()
    const showChangeResidueIndexDialog = useShowChangeResidueIndexDialog()
    const showMolSuperposeDialog = useShowMolSuperposeDialog()

    useRegisterCommand(CmdId.UiChangeChainIdDialog, () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        void showChangeChainIdDialog({ sceneId: info.scene_uid })
    })

    useRegisterCommand(CmdId.UiDeleteMolDialog, () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        void showDeleteMolDialog({ sceneId: info.scene_uid })
    })

    useRegisterCommand(CmdId.UiChangeResidueIndexDialog, () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        void showChangeResidueIndexDialog({ sceneId: info.scene_uid })
    })

    useRegisterCommand(CmdId.UiMolSuperpose, () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        void showMolSuperposeDialog({ sceneId: info.scene_uid, viewId: info.view_id })
    })
}
