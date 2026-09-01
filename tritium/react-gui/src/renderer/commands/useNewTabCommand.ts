/**
 * @file commands/useNewTabCommand.ts
 * @description Registers the CmdId.TabNew command with the full UXP-parity
 * new-tab dialog flow: proposes unique names, shows NewTabDialog, then
 * creates a new scene+view or adds a view to the current scene.
 */

import { useCallback } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from './commandTypes'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { useShowNewTabDialog } from '@renderer/dialogs/NewTabDialogProvider'
import type { NewSceneAction } from '@renderer/hooks/useNewSceneAction'
import { makeTabLabel } from '@renderer/worker/shared/tabLabel'
import { useWorkspaceDispatch } from '@renderer/state/workspace'
import { useNewSceneDefaults } from '@renderer/contexts/NewSceneDefaultsContext'
import { toInitialProps } from '@renderer/data/newSceneDefaults'

interface UseNewTabCommandOptions {
    cm: AsyncCueMol | null
    getActiveSceneInfo: ActiveSceneCommandDeps
    newScene: NewSceneAction
}

export function useNewTabCommand({
    cm,
    getActiveSceneInfo,
    newScene,
}: UseNewTabCommandOptions): void {
    const showNewTabDialog = useShowNewTabDialog()
    const { openMolViewTab } = useWorkspaceDispatch()
    const { defaults: sceneDefaults, setDefaults } = useNewSceneDefaults()

    const openNewTab = useCallback(async (): Promise<void> => {
        if (!cm) return

        const dpr = window.devicePixelRatio || 1
        const active = getActiveSceneInfo()

        const names = await cm.invokeService('proposeNewTabNames', { sceneId: active?.scene_uid })
        if (!names) return

        const result = await showNewTabDialog({
            currentSceneName: names.currentSceneName,
            defaultSceneName: names.defaultSceneName,
            defaultViewName: names.defaultViewName,
            sceneDefaults,
        })
        if (!result) return

        if (result.mode === 'new-scene') {
            // What was just confirmed becomes what the next new scene starts
            // from, here and on the next app launch.
            if (result.sceneDefaults) setDefaults(result.sceneDefaults)
            // Same path as app launch (UXP onNewScene). The settings are passed
            // explicitly rather than read back through the context, which has
            // not re-rendered yet at this point.
            await newScene({
                name: result.name,
                initialProps: result.sceneDefaults
                    ? toInitialProps(result.sceneDefaults)
                    : undefined,
            })
        } else {
            // new-view: add view to existing scene
            if (!active) return
            const res = await cm.invokeService('createViewInScene', {
                sceneId: active.scene_uid,
                name: result.name,
                inheritFromViewId: result.inheritViewProps ? active.view_id : undefined,
                dpr,
            })
            if (!res?.ok || res.view_uid === undefined) return
            // UXP makeTabLabel format: `<scene name>:<view name>`.
            const title = makeTabLabel(names.currentSceneName ?? '', result.name)
            openMolViewTab(title, res.view_uid, active.scene_uid)
        }
    }, [cm, openMolViewTab, getActiveSceneInfo, showNewTabDialog, newScene, sceneDefaults, setDefaults])

    useRegisterCommand(CmdId.TabNew, () => {
        openNewTab().catch((e: unknown) => console.error('TabNew failed:', e))
    })
}
