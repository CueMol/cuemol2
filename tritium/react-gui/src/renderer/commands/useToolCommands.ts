/**
 * @file commands/useToolCommands.ts
 * @description Registers molecule-editing tool dialog triggers (UXP
 * `tools/*` dialogs reached from the Edit / Tools menus). Currently:
 *   - `UiChangeChainIdDialog` -> `ChangeChainIdDialog` (UXP `chg_chname`).
 *   - `UiDeleteMolDialog` -> `DeleteMolDialog` (UXP `tools/mol_delete`).
 *   - `UiChangeResidueIndexDialog` -> `ChangeResidueIndexDialog` (UXP `tools/chg_resindex`).
 *   - `UiMergeMolDialog` -> `MergeMolDialog` (UXP `tools/mol_merge`).
 *   - `UiMakeMolSurfDialog` -> `MakeMolSurfDialog` (UXP `tools/makesurf`).
 *   - `UiInteractionAnalysisDialog` -> `InteractionAnalysisDialog` (UXP `tools/intr-tool`).
 *   - `UiCutSurfByPlaneDialog` -> `CutSurfByPlaneDialog` (UXP `tools/surf-cutbyplane`).
 *   - `UiReassignProt2ndryDialog` -> `ReassignProt2ndryDialog` (UXP `tools/prot2ndry-tool`).
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
import { useShowMergeMolDialog } from '../components/dialogs/MergeMolDialogProvider'
import { useShowMakeMolSurfDialog } from '../components/dialogs/MakeMolSurfDialogProvider'
import { useShowInteractionAnalysisDialog } from '../components/dialogs/InteractionAnalysisDialogProvider'
import { useShowCutSurfByPlaneDialog } from '../components/dialogs/CutSurfByPlaneDialogProvider'
import { useShowReassignProt2ndryDialog } from '../components/dialogs/ReassignProt2ndryDialogProvider'
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
    const showMergeMolDialog = useShowMergeMolDialog()
    const showMakeMolSurfDialog = useShowMakeMolSurfDialog()
    const showInteractionAnalysisDialog = useShowInteractionAnalysisDialog()
    const showCutSurfByPlaneDialog = useShowCutSurfByPlaneDialog()
    const showReassignProt2ndryDialog = useShowReassignProt2ndryDialog()
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

    useRegisterCommand(CmdId.UiMergeMolDialog, () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        void showMergeMolDialog({ sceneId: info.scene_uid })
    })

    useRegisterCommand(CmdId.UiMakeMolSurfDialog, () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        void showMakeMolSurfDialog({ sceneId: info.scene_uid })
    })

    useRegisterCommand(CmdId.UiInteractionAnalysisDialog, () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        void showInteractionAnalysisDialog({ sceneId: info.scene_uid })
    })

    useRegisterCommand(CmdId.UiCutSurfByPlaneDialog, () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        void showCutSurfByPlaneDialog({
            sceneId: info.scene_uid,
            viewId: info.view_id,
        })
    })

    useRegisterCommand(CmdId.UiReassignProt2ndryDialog, () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        void showReassignProt2ndryDialog({ sceneId: info.scene_uid })
    })

    useRegisterCommand(CmdId.UiMolSuperpose, () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        void showMolSuperposeDialog({ sceneId: info.scene_uid, viewId: info.view_id })
    })
}
