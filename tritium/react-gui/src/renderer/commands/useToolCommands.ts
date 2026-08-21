/**
 * @file commands/useToolCommands.ts
 * @description Registers molecule-editing tool dialog triggers (UXP
 * `tools/*` dialogs reached from the Edit / Tools menus). Currently:
 *   - `UiChangeChainIdDialog` -> `ChangeChainIdDialog` (UXP `chg_chname`).
 *   - `UiDeleteMolDialog` -> `DeleteMolDialog` (UXP `tools/mol_delete`).
 *   - `UiChangeResidueIndexDialog` -> `ChangeResidueIndexDialog` (UXP `tools/chg_resindex`).
 *   - `UiMergeMolDialog` -> `MergeMolDialog` (UXP `tools/mol_merge`).
 *   - `UiMakeMolSurfDialog` -> `MakeMolSurfDialog` (UXP `tools/makesurf`).
 *   - `UiCalcApbsPotDialog` -> `CalcApbsPotDialog` (UXP `tools/apbs-calcpot`).
 *   - `UiInteractionAnalysisDialog` -> `InteractionAnalysisDialog` (UXP `tools/intr-tool`).
 *   - `UiCutSurfByPlaneDialog` -> `CutSurfByPlaneDialog` (UXP `tools/surf-cutbyplane`).
 *   - `UiReassignProt2ndryDialog` -> `ReassignProt2ndryDialog` (UXP `tools/prot2ndry-tool`).
 *   - `UiMolSuperpose` -> `MolSuperposeDialog` (UXP `tools/ssm_sup`).
 *   - `UiMorphAnimDialog` -> `MorphAnimDialog` (UXP `tools/morphanim-tool`).
 *
 * Each command resolves the active scene, opens the dialog (which owns its
 * own commit via a worker service), and returns. Future tool dialogs
 * (Change residue index, Merge molecule, ...) register here too.
 */

import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from './commandTypes'
import type { CommandKey } from './CommandMap'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { useShowChangeChainIdDialog } from '../components/dialogs/ChangeChainIdDialogProvider'
import { useShowDeleteMolDialog } from '../components/dialogs/DeleteMolDialogProvider'
import { useShowChangeResidueIndexDialog } from '../components/dialogs/ChangeResidueIndexDialogProvider'
import { useShowMergeMolDialog } from '../components/dialogs/MergeMolDialogProvider'
import { useShowMakeMolSurfDialog } from '../components/dialogs/MakeMolSurfDialogProvider'
import { useShowCalcApbsPotDialog } from '../components/dialogs/CalcApbsPotDialogProvider'
import { useShowInteractionAnalysisDialog } from '../components/dialogs/InteractionAnalysisDialogProvider'
import { useShowCutSurfByPlaneDialog } from '../components/dialogs/CutSurfByPlaneDialogProvider'
import { useShowReassignProt2ndryDialog } from '../components/dialogs/ReassignProt2ndryDialogProvider'
import { useShowMolSuperposeDialog } from '../components/dialogs/MolSuperposeDialogProvider'
import { useShowMorphAnimDialog } from '../components/dialogs/MorphAnimDialogProvider'

interface UseToolCommandsOptions {
    cm: AsyncCueMol | null
    getActiveSceneInfo: ActiveSceneCommandDeps
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
    const showCalcApbsPotDialog = useShowCalcApbsPotDialog()
    const showInteractionAnalysisDialog = useShowInteractionAnalysisDialog()
    const showCutSurfByPlaneDialog = useShowCutSurfByPlaneDialog()
    const showReassignProt2ndryDialog = useShowReassignProt2ndryDialog()
    const showMolSuperposeDialog = useShowMolSuperposeDialog()
    const showMorphAnimDialog = useShowMorphAnimDialog()

    /**
     * Register a command that resolves the active scene/view before running
     * `run(info)`. No-op when there is no CueMol instance or no active scene,
     * matching the per-command `if (!cm) ... if (!info) ...` preamble.
     *
     * Named with a `use` prefix because it calls `useRegisterCommand`; it is
     * invoked unconditionally in a fixed order so the hook-call order stays
     * stable across renders.
     */
    const useActiveSceneCommand = (
        id: CommandKey,
        run: (info: { scene_uid: number; view_id: number }) => void,
    ): void => {
        useRegisterCommand(id, () => {
            if (!cm) return
            const info = getActiveSceneInfo()
            if (!info) return
            run(info)
        })
    }

    useActiveSceneCommand(CmdId.UiChangeChainIdDialog, (info) => {
        void showChangeChainIdDialog({ sceneId: info.scene_uid })
    })

    useActiveSceneCommand(CmdId.UiDeleteMolDialog, (info) => {
        void showDeleteMolDialog({ sceneId: info.scene_uid })
    })

    useActiveSceneCommand(CmdId.UiChangeResidueIndexDialog, (info) => {
        void showChangeResidueIndexDialog({ sceneId: info.scene_uid })
    })

    useActiveSceneCommand(CmdId.UiMergeMolDialog, (info) => {
        void showMergeMolDialog({ sceneId: info.scene_uid })
    })

    useActiveSceneCommand(CmdId.UiMakeMolSurfDialog, (info) => {
        void showMakeMolSurfDialog({ sceneId: info.scene_uid })
    })

    useActiveSceneCommand(CmdId.UiCalcApbsPotDialog, (info) => {
        void showCalcApbsPotDialog({ sceneId: info.scene_uid })
    })

    useActiveSceneCommand(CmdId.UiInteractionAnalysisDialog, (info) => {
        void showInteractionAnalysisDialog({ sceneId: info.scene_uid })
    })

    useActiveSceneCommand(CmdId.UiCutSurfByPlaneDialog, (info) => {
        void showCutSurfByPlaneDialog({
            sceneId: info.scene_uid,
            viewId: info.view_id,
        })
    })

    useActiveSceneCommand(CmdId.UiReassignProt2ndryDialog, (info) => {
        void showReassignProt2ndryDialog({ sceneId: info.scene_uid })
    })

    useActiveSceneCommand(CmdId.UiMolSuperpose, (info) => {
        void showMolSuperposeDialog({ sceneId: info.scene_uid, viewId: info.view_id })
    })

    useActiveSceneCommand(CmdId.UiMorphAnimDialog, (info) => {
        void showMorphAnimDialog({ sceneId: info.scene_uid })
    })
}
