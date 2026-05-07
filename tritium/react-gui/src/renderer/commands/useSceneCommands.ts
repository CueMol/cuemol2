/**
 * @file commands/useSceneCommands.ts
 * @description Registers scene/object load command handlers.
 *
 * Scope is limited to scene creation and object/scene-from-path loading.
 * UI dialog triggers, tab management, and edit operations are split into
 * useUiDialogCommands / useTabCommands / useEditCommands.
 */

import { useCallback } from 'react'
import type { SceneBgColor } from '../../shared/ipcTypes'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { useShowFileOpenOptionDialog } from '../components/fopen-opt-dlgs/FileOpenOptionDialogProvider'

interface UseSceneCommandsOptions {
    cm: AsyncCueMol | null
    addMolTab: (title: string, viewId: number, sceneId: number) => void
    addMolViewTab: (title: string, viewId: number) => void
    getActiveSceneInfo: () => { scene_uid: number; view_id: number } | null | undefined
    onBgColorChanged?: (bgColor: SceneBgColor) => void
}

export function useSceneCommands({
    cm,
    addMolTab,
    addMolViewTab,
    getActiveSceneInfo,
    onBgColorChanged,
}: UseSceneCommandsOptions): void {

    const showFileOpenOptionDialog = useShowFileOpenOptionDialog()

    const openNewScene = useCallback(async (filePath?: string): Promise<void> => {
        if (!cm) return
        const dpr = window.devicePixelRatio || 1
        const ids = await cm.createNewSceneAndView(dpr)
        if (!ids) return
        const { scene_uid, view_uid } = ids
        const title = `Scene ${scene_uid}`
        addMolTab(title, view_uid, scene_uid)
        addMolViewTab(title, view_uid)
        if (filePath) {
            await cm.loadScene(filePath, scene_uid)
        }
    }, [cm, addMolTab, addMolViewTab])

    useRegisterCommand(CmdId.SceneNew, () => openNewScene())

    const setSceneBgColor = useCallback(async (colorName: 'white' | 'black'): Promise<void> => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        const result = await cm.setSceneBgColor(info.scene_uid, colorName)
        if (result?.ok) onBgColorChanged?.(colorName)
    }, [cm, getActiveSceneInfo, onBgColorChanged])

    useRegisterCommand(CmdId.SceneBgWhite, () => setSceneBgColor('white'))
    useRegisterCommand(CmdId.SceneBgBlack, () => setSceneBgColor('black'))

    useRegisterCommand(
        CmdId.OpenObjByPath,
        (data: FileOpenedData | undefined) => {
            if (!data) return
            if (!cm) return
            const info = getActiveSceneInfo()
            if (!info) return
            ;(async () => {
                const rendererTypes = await cm.getCompatibleRendererNames(data.path)
                const options = await showFileOpenOptionDialog({ filePath: data.path, rendererTypes })
                if (options === null) return
                await cm.loadObject(data.path, info.scene_uid, options)
            })().catch((e: unknown) => console.error('OpenObjByPath failed:', e))
        },
    )

    useRegisterCommand(
        CmdId.OpenSceneByPath,
        (path: string | undefined) => {
            if (!path) return
            openNewScene(path).catch((e: unknown) =>
                console.error('openNewScene failed:', e),
            )
        },
    )
}
