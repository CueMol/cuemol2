/**
 * @file commands/useNewTabCommand.ts
 * @description Registers the CmdId.TabNew command with the full UXP-parity
 * new-tab dialog flow: proposes unique names, shows NewTabDialog, then
 * creates a new scene+view or adds a view to the current scene.
 */

import { useCallback } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { useDialog } from '../contexts/DialogContext'

interface UseNewTabCommandOptions {
    cm: AsyncCueMol | null
    addMolTab: (title: string, viewId: number, sceneId: number) => void
    addMolViewTab: (title: string, viewId: number) => void
    getActiveSceneInfo: () => { scene_uid: number; view_id: number } | null | undefined
}

export function useNewTabCommand({
    cm,
    addMolTab,
    addMolViewTab,
    getActiveSceneInfo,
}: UseNewTabCommandOptions): void {
    const { showNewTabDialog } = useDialog()

    const openNewTab = useCallback(async (): Promise<void> => {
        if (!cm) return

        const dpr = window.devicePixelRatio || 1
        const active = getActiveSceneInfo()

        const names = await cm.proposeNewTabNames({ sceneId: active?.scene_uid })
        if (!names) return

        const result = await showNewTabDialog({
            currentSceneName: names.currentSceneName,
            defaultSceneName: names.defaultSceneName,
            defaultViewName: names.defaultViewName,
        })
        if (!result) return

        if (result.mode === 'new-scene') {
            const ids = await cm.createNewSceneAndView(dpr, result.name)
            if (!ids) return
            const { scene_uid, view_uid } = ids
            addMolTab(result.name, view_uid, scene_uid)
            addMolViewTab(result.name, view_uid)
        } else {
            // new-view: add view to existing scene
            if (!active) return
            const res = await cm.createViewInScene({
                sceneId: active.scene_uid,
                name: result.name,
                inheritFromViewId: result.inheritViewProps ? active.view_id : undefined,
                dpr,
            })
            if (!res?.ok || res.view_uid === undefined) return
            addMolTab(result.name, res.view_uid, active.scene_uid)
            addMolViewTab(result.name, res.view_uid)
        }
    }, [cm, addMolTab, addMolViewTab, getActiveSceneInfo, showNewTabDialog])

    useRegisterCommand(CmdId.TabNew, () => {
        openNewTab().catch((e: unknown) => console.error('TabNew failed:', e))
    })
}
