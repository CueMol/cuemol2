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

/**
 * Tools-menu commands that open a dialog for the active scene, in
 * registration order. Exported so the set can be checked from tests.
 */
export const ACTIVE_SCENE_DIALOG_COMMANDS = [
    CmdId.UiChangeChainIdDialog,
    CmdId.UiDeleteMolDialog,
    CmdId.UiChangeResidueIndexDialog,
    CmdId.UiMergeMolDialog,
    CmdId.UiMakeMolSurfDialog,
    CmdId.UiCalcApbsPotDialog,
    CmdId.UiInteractionAnalysisDialog,
    CmdId.UiCutSurfByPlaneDialog,
    CmdId.UiReassignProt2ndryDialog,
    CmdId.UiMolSuperpose,
    CmdId.UiMorphAnimDialog,
] as const

/** The two whose dialog acts on the view as well as the scene. */
const WANTS_VIEW_ID: ReadonlySet<string> = new Set<string>([
    CmdId.UiCutSurfByPlaneDialog,
    CmdId.UiMolSuperpose,
])

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
     * The Tools menu is eleven variations on one shape: resolve the active
     * scene, then open a dialog for it. Declaring them as data keeps the
     * shape in one place -- and makes the set enumerable, which is what
     * `menuActionMap.pureCmdIds.test.ts` reads to check that every Tools menu
     * entry has a handler.
     *
     * `viewId` is passed to the two dialogs that act on the view as well as
     * the scene (a plane cut and a superposition both need the camera).
     */
    const dialogs = {
        [CmdId.UiChangeChainIdDialog]: showChangeChainIdDialog,
        [CmdId.UiDeleteMolDialog]: showDeleteMolDialog,
        [CmdId.UiChangeResidueIndexDialog]: showChangeResidueIndexDialog,
        [CmdId.UiMergeMolDialog]: showMergeMolDialog,
        [CmdId.UiMakeMolSurfDialog]: showMakeMolSurfDialog,
        [CmdId.UiCalcApbsPotDialog]: showCalcApbsPotDialog,
        [CmdId.UiInteractionAnalysisDialog]: showInteractionAnalysisDialog,
        [CmdId.UiCutSurfByPlaneDialog]: showCutSurfByPlaneDialog,
        [CmdId.UiReassignProt2ndryDialog]: showReassignProt2ndryDialog,
        [CmdId.UiMolSuperpose]: showMolSuperposeDialog,
        [CmdId.UiMorphAnimDialog]: showMorphAnimDialog,
    }

    // Fixed order over a module constant, so the hook-call order is stable.
    for (const id of ACTIVE_SCENE_DIALOG_COMMANDS) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useRegisterCommand(id, () => {
            if (!cm) return
            const info = getActiveSceneInfo()
            if (!info) return
            const args = WANTS_VIEW_ID.has(id)
                ? { sceneId: info.scene_uid, viewId: info.view_id }
                : { sceneId: info.scene_uid }
            void (dialogs[id] as (a: typeof args) => Promise<unknown>)(args)
        })
    }
}
