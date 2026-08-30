/**
 * Tools-menu dialog commands.
 *
 * Eleven commands were eleven copies of "resolve the active scene, then open a
 * dialog for it". They are a table now, so these pin what the table has to
 * keep doing: the active scene is resolved per dispatch (not captured at
 * registration), nothing happens without one, and the two view-scoped dialogs
 * still get the view id.
 */

import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { CommandProvider, useCommands } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import { ACTIVE_SCENE_DIALOG_COMMANDS, useToolCommands } from '@renderer/commands/useToolCommands'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import { makeRenderHook } from '@renderer/__test__/helpers/testHarness'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

/**
 * One spy per dialog hook, recording the args it was shown with. `vi.hoisted`
 * because vi.mock factories are lifted above the file's own declarations.
 */
const shown = vi.hoisted(() => [] as Array<{ dialog: string; args: unknown }>)

vi.mock('@renderer/dialogs/ChangeChainIdDialogProvider', () => ({
    useShowChangeChainIdDialog: () => (args: unknown) => {
        shown.push({ dialog: 'changeChainId', args })
        return Promise.resolve(undefined)
    },
}))
vi.mock('@renderer/dialogs/DeleteMolDialogProvider', () => ({
    useShowDeleteMolDialog: () => (args: unknown) => {
        shown.push({ dialog: 'deleteMol', args })
        return Promise.resolve(undefined)
    },
}))
vi.mock('@renderer/dialogs/ChangeResidueIndexDialogProvider', () => ({
    useShowChangeResidueIndexDialog: () => (args: unknown) => {
        shown.push({ dialog: 'changeResidueIndex', args })
        return Promise.resolve(undefined)
    },
}))
vi.mock('@renderer/dialogs/MergeMolDialogProvider', () => ({
    useShowMergeMolDialog: () => (args: unknown) => {
        shown.push({ dialog: 'mergeMol', args })
        return Promise.resolve(undefined)
    },
}))
vi.mock('@renderer/dialogs/MakeMolSurfDialogProvider', () => ({
    useShowMakeMolSurfDialog: () => (args: unknown) => {
        shown.push({ dialog: 'makeMolSurf', args })
        return Promise.resolve(undefined)
    },
}))
vi.mock('@renderer/dialogs/CalcApbsPotDialogProvider', () => ({
    useShowCalcApbsPotDialog: () => (args: unknown) => {
        shown.push({ dialog: 'calcApbsPot', args })
        return Promise.resolve(undefined)
    },
}))
vi.mock('@renderer/dialogs/InteractionAnalysisDialogProvider', () => ({
    useShowInteractionAnalysisDialog: () => (args: unknown) => {
        shown.push({ dialog: 'interactionAnalysis', args })
        return Promise.resolve(undefined)
    },
}))
vi.mock('@renderer/dialogs/CutSurfByPlaneDialogProvider', () => ({
    useShowCutSurfByPlaneDialog: () => (args: unknown) => {
        shown.push({ dialog: 'cutSurfByPlane', args })
        return Promise.resolve(undefined)
    },
}))
vi.mock('@renderer/dialogs/ReassignProt2ndryDialogProvider', () => ({
    useShowReassignProt2ndryDialog: () => (args: unknown) => {
        shown.push({ dialog: 'reassignProt2ndry', args })
        return Promise.resolve(undefined)
    },
}))
vi.mock('@renderer/dialogs/MolSuperposeDialogProvider', () => ({
    useShowMolSuperposeDialog: () => (args: unknown) => {
        shown.push({ dialog: 'molSuperpose', args })
        return Promise.resolve(undefined)
    },
}))
vi.mock('@renderer/dialogs/MorphAnimDialogProvider', () => ({
    useShowMorphAnimDialog: () => (args: unknown) => {
        shown.push({ dialog: 'morphAnim', args })
        return Promise.resolve(undefined)
    },
}))

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(CommandProvider, null, children)

function mount(getActiveSceneInfo: () => { scene_uid: number; view_id: number } | undefined) {
    return makeRenderHook(() => {
        useToolCommands({ cm: {} as AsyncCueMol, getActiveSceneInfo })
        return useCommands()
    }, Wrapper)
}

describe('useToolCommands', () => {
    it('registers every command in the table', async () => {
        shown.length = 0
        const h = mount(() => ({ scene_uid: 7, view_id: 3 }))
        for (const id of ACTIVE_SCENE_DIALOG_COMMANDS) {
            await (h.result.dispatch as (i: string) => Promise<unknown>)(id)
        }
        expect(shown).toHaveLength(ACTIVE_SCENE_DIALOG_COMMANDS.length)
        h.unmount()
    })

    it('passes the scene id, and the view id only where the dialog needs it', async () => {
        shown.length = 0
        const h = mount(() => ({ scene_uid: 7, view_id: 3 }))
        await h.result.dispatch(CmdId.UiChangeChainIdDialog)
        await h.result.dispatch(CmdId.UiCutSurfByPlaneDialog)
        await h.result.dispatch(CmdId.UiMolSuperpose)
        expect(shown).toEqual([
            { dialog: 'changeChainId', args: { sceneId: 7 } },
            { dialog: 'cutSurfByPlane', args: { sceneId: 7, viewId: 3 } },
            { dialog: 'molSuperpose', args: { sceneId: 7, viewId: 3 } },
        ])
        h.unmount()
    })

    it('resolves the active scene per dispatch, not at registration', async () => {
        shown.length = 0
        let info: { scene_uid: number; view_id: number } | undefined = { scene_uid: 1, view_id: 1 }
        const h = mount(() => info)
        await h.result.dispatch(CmdId.UiMergeMolDialog)
        info = { scene_uid: 2, view_id: 9 }
        await h.result.dispatch(CmdId.UiMergeMolDialog)
        expect(shown.map((s) => s.args)).toEqual([{ sceneId: 1 }, { sceneId: 2 }])
        h.unmount()
    })

    it('does nothing when no scene is active', async () => {
        shown.length = 0
        const h = mount(() => undefined)
        await h.result.dispatch(CmdId.UiMakeMolSurfDialog)
        expect(shown).toEqual([])
        h.unmount()
    })
})
