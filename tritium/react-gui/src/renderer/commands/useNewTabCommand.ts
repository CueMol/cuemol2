/**
 * @file commands/useNewTabCommand.ts
 * @description Registers the CmdId.TabNew command with the full UXP-parity
 * new-tab dialog flow: proposes unique names, shows NewTabDialog, then
 * creates a new scene+view or adds a view to the current scene.
 */

import { useCallback } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from './commandTypes'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { useShowNewTabDialog } from '../components/dialogs/NewTabDialogProvider'
import type { NewSceneAction } from '../hooks/useNewSceneAction'

interface UseNewTabCommandOptions {
    cm: AsyncCueMol | null
    addMolTab: (title: string, viewId: number, sceneId: number) => void
    addMolViewTab: (title: string, viewId: number) => void
    getActiveSceneInfo: ActiveSceneCommandDeps
    newScene: NewSceneAction
}

export function useNewTabCommand({
    cm,
    addMolTab,
    addMolViewTab,
    getActiveSceneInfo,
    newScene,
}: UseNewTabCommandOptions): void {
    const showNewTabDialog = useShowNewTabDialog()

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
        })
        if (!result) return

        if (result.mode === 'new-scene') {
            // Same path as app launch (UXP onNewScene).
            await newScene({ name: result.name })
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
            const title = `${names.currentSceneName ?? ''}:${result.name}`
            addMolTab(title, res.view_uid, active.scene_uid)
            addMolViewTab(title, res.view_uid)
        }
    }, [cm, addMolTab, addMolViewTab, getActiveSceneInfo, showNewTabDialog, newScene])

    useRegisterCommand(CmdId.TabNew, () => {
        openNewTab().catch((e: unknown) => console.error('TabNew failed:', e))
    })
}
