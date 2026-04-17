/**
 * @file commands/useSceneCommands.ts
 * @description Registers scene/file/tab command handlers into the command registry.
 *
 * This hook is called once near the root of the app (App.tsx) and registers
 * all operations so they can be dispatched from IPC listeners, toolbar
 * buttons, keyboard shortcuts, or any other UI surface.
 */

import { useCallback } from 'react'
import type { SceneManager } from '@cuemol/core/src/wrappers/SceneManager'
import type { StreamManager } from '@cuemol/core/src/wrappers/StreamManager'
import type { AsyncCueMol } from '../worker/AsyncCueMol'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { useDialog } from '../contexts/DialogContext'

// Category IDs from src/qsys/InOutHandler.hpp (IOH_CAT_*)
const IOH_CAT_OBJREADER = 0
const IOH_CAT_SCEREADER = 3

// Convert C++ fext pattern (e.g. "*.pdb;*.ent") to Electron extension array (e.g. ["pdb", "ent"])
function parseFext(fext: string): string[] {
    return fext
        .split(';')
        .map((e) => e.trim().replace(/^\*\./, ''))
        .filter((e) => e !== '' && e !== '*')
}

interface UseSceneCommandsOptions {
    cm: AsyncCueMol | null
    addMolTab: (title: string, viewId: number, sceneId: number) => void
    addMolViewTab: (title: string, viewId: number) => void
    getActiveSceneInfo: () => { scene_uid: number; view_id: number } | null | undefined
    openFileFromData: (name: string, content: string, filePath?: string) => void
    handleNewTab: () => void
    handleCloseTab: (id: string) => void
    handleSave: () => void
}

export function useSceneCommands({
    cm,
    addMolTab,
    addMolViewTab,
    getActiveSceneInfo,
    openFileFromData,
    handleNewTab,
    handleCloseTab,
    handleSave,
}: UseSceneCommandsOptions): void {

    const { showFileOpenOptionDialog } = useDialog()

    // --- helpers ---

    const getOpenFilters = useCallback(async (catId: number): Promise<ElectronFileFilter[]> => {
        if (!cm) return []
        const strMgr = (await cm.getService('StreamManager')) as StreamManager
        // StreamManager wrappers return Promise at runtime via ObjProxy (async/sync mismatch).
        const infoJson = await (strMgr.getInfoJSON2() as unknown as Promise<string>)
        const info: Array<{ name: string; descr: string; fext: string; category: number }> =
            JSON.parse(infoJson)
        const items = info.filter((e) => e.category === catId && e.name.indexOf('qdf') != 0)
        const allExts = items.flatMap((e) => parseFext(e.fext))
        return [
            { name: 'All Supported', extensions: allExts },
            ...items.map((e) => ({ name: e.descr, extensions: parseFext(e.fext) })),
            { name: 'All Files', extensions: ['*'] },
        ]
    }, [cm])

    const openNewScene = useCallback(async (filePath?: string): Promise<void> => {
        if (!cm) return
        const sceMgr = (await cm.getService('SceneManager')) as SceneManager
        if (!sceMgr) return
        const scene = await sceMgr.createScene()
        const scene_uid = await scene.getUID()
        const view = await scene.createView()
        const view_uid = await view.getUID()
        const dpr = window.devicePixelRatio || 1
        await cm.addView(view_uid, dpr)
        const title = `Scene ${scene_uid}`
        addMolTab(title, view_uid, scene_uid)
        addMolViewTab(title, view_uid)
        if (filePath) {
            await cm.loadScene(filePath, scene_uid)
        }
    }, [cm, addMolTab, addMolViewTab])

    // --- command registrations ---

    useRegisterCommand(CmdId.SceneNew, () => openNewScene())

    useRegisterCommand(
        CmdId.OpenObjByPath,
        (data: FileOpenedData | undefined) => {
            if (!data) return
            if (data.content !== undefined) {
                openFileFromData(data.name, data.content, data.path)
                return
            }
            if (!cm) return
            const info = getActiveSceneInfo()
            if (!info) return
            ;(async () => {
                const rendererTypes = await cm.getCompatibleRendererNames(data.path)
                const options = await showFileOpenOptionDialog(data.path, rendererTypes)
                if (options === null) return  // user cancelled
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

    useRegisterCommand(CmdId.UiOpenObjDialog, async () => {
        if (!cm) return
        const filters = await getOpenFilters(IOH_CAT_OBJREADER)
        await window.electronAPI.openFile({ dialogType: 'open-obj', filters })
    })

    useRegisterCommand(CmdId.UiOpenSceneDialog, async () => {
        if (!cm) return
        const filters = await getOpenFilters(IOH_CAT_SCEREADER)
        await window.electronAPI.openFile({ dialogType: 'open-scene', filters })
    })

    useRegisterCommand(CmdId.TabNew, () => handleNewTab())

    useRegisterCommand(CmdId.TabClose, (id: string | undefined) => {
        if (id) handleCloseTab(id)
    })

    useRegisterCommand(CmdId.FileSave, () => handleSave())
}
