/**
 * @file commands/useSceneCommands.ts
 * @description Registers scene/object load command handlers.
 *
 * Scope is limited to scene creation and object/scene-from-path loading.
 * UI dialog triggers, tab management, and edit operations are split into
 * useUiDialogCommands / useTabCommands / useEditCommands.
 */

import { useCallback, useMemo } from 'react'
import type { SceneBgColor } from '@shared/types/menuState'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from './commandTypes'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { addRecent } from './addRecent'
import { useShowFileOpenOptionDialog } from '@renderer/dialogs/fopen-opt-dlgs/FileOpenOptionDialogProvider'
import { useShowErrorAlert } from '@renderer/dialogs/ErrorAlertDialogProvider'
import { fetchPresetTypes } from '@renderer/features/file-io/fetchPresetTypes'
import { makeResolveOpenTarget } from '@renderer/hooks/useEnsureActiveScene'
import type { NewSceneAction, OpenSceneFileAction } from '@renderer/hooks/useNewSceneAction'
import type { FileOpenedData } from '@shared/types/fileEvents'
import type { OpenResult } from './CommandMap'

interface UseSceneCommandsOptions {
    cm: AsyncCueMol | null
    getActiveSceneInfo: ActiveSceneCommandDeps
    onBgColorChanged?: (bgColor: SceneBgColor) => void
    onColorProofingChanged?: (active: boolean) => void
    /** Open the active scene in the generic property inspector (Scene > Properties...). */
    showSceneProperty?: (sceneId: number) => void
    newScene: NewSceneAction
    /** Open a scene file in its own tab (created only once it has loaded). */
    openSceneFile: OpenSceneFileAction
}

export function useSceneCommands({
    cm,
    getActiveSceneInfo,
    onBgColorChanged,
    onColorProofingChanged,
    showSceneProperty,
    newScene,
    openSceneFile,
}: UseSceneCommandsOptions): void {

    const showFileOpenOptionDialog = useShowFileOpenOptionDialog()
    const showErrorAlert = useShowErrorAlert()

    const openNewScene = useCallback(async (filePath?: string): Promise<OpenResult> => {
        if (!cm) return { loaded: false }
        // UXP openSceneImpl parity: opening a scene file into a "just created"
        // (empty & unmodified) current scene loads into it in place, without
        // spawning a new tab. New Scene (no filePath) always makes a fresh tab.
        if (filePath) {
            const active = getActiveSceneInfo()
            if (active) {
                const { justCreated } = await cm.invokeService(
                    'isSceneJustCreated', { sceneId: active.scene_uid },
                )
                if (justCreated) {
                    const loaded = await cm.loadScene(filePath, active.scene_uid)
                    if (!loaded.ok) {
                        await showErrorAlert({
                            title: 'Open Scene failed',
                            message: `Failed to open:\n${filePath}\n\n${loaded.error}`,
                        })
                        return { loaded: false }
                    }
                    addRecent(filePath, 'scene')
                    return { loaded: true, sceneId: active.scene_uid }
                }
            }
        }
        if (filePath) {
            // Scene, read and view are created together in the worker, so a
            // file that cannot be read leaves no empty tab behind.
            const opened = await openSceneFile(filePath)
            if (!opened.ok) {
                await showErrorAlert({
                    title: 'Open Scene failed',
                    message: `Failed to open:\n${filePath}\n\n${opened.error}`,
                })
                return { loaded: false }
            }
            addRecent(filePath, 'scene')
            return { loaded: true, sceneId: opened.scene_uid }
        }
        // File > New Scene: same path as app launch (UXP onNewScene).
        await newScene()
        return { loaded: false }
    }, [cm, newScene, openSceneFile, getActiveSceneInfo, showErrorAlert])

    useRegisterCommand(CmdId.SceneNew, () => { void openNewScene() })

    // Resolve where an opened object goes: the active scene, or a scene of its
    // own when the caller asked for one. Creates the scene only on commit, so
    // a cancelled option dialog leaves no tab behind -- see
    // hooks/useEnsureActiveScene.ts.
    const resolveOpenTarget = useMemo(
        () => makeResolveOpenTarget(getActiveSceneInfo, newScene, async (sceneId) => {
            if (!cm) return false
            const res = await cm.invokeService('isSceneJustCreated', { sceneId })
            return res?.justCreated === true
        }),
        [cm, getActiveSceneInfo, newScene],
    )

    const setSceneBgColor = useCallback(async (colorName: 'white' | 'black'): Promise<void> => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        const result = await cm.invokeService('setSceneBgColor', { sceneId: info.scene_uid, colorName })
        if (result?.ok) onBgColorChanged?.(colorName)
    }, [cm, getActiveSceneInfo, onBgColorChanged])

    useRegisterCommand(CmdId.SceneBgWhite, () => setSceneBgColor('white'))
    useRegisterCommand(CmdId.SceneBgBlack, () => setSceneBgColor('black'))

    // Scene > Use color proofing (UXP `onColorProof`): toggle the active
    // scene's color-proofing flag. The worker sets a default ICC profile when
    // none is configured, so a plain toggle takes effect. Same worker service
    // as the scene-tree context menu's Use color proofing item.
    useRegisterCommand(CmdId.SceneColorProof, async () => {
        if (!cm) return
        const info = getActiveSceneInfo()
        if (!info) return
        const res = await cm.invokeService('toggleSceneColorProofing', {
            sceneId: info.scene_uid,
        })
        // The worker reports the resulting state (it is off unless a profile
        // is configured), so the menu's check follows what actually happened
        // rather than what was asked for.
        if (res?.ok) onColorProofingChanged?.(res.enabled)
    })

    // Scene > Properties... : open the active scene node in the inspector.
    // The scene's tree-node id equals its scene uid, so the generic inspector
    // opener resolves it (SceneRenderingSection). Parity with the scene-tree
    // context menu's Properties... on a scene row.
    useRegisterCommand(CmdId.SceneProperties, () => {
        const info = getActiveSceneInfo()
        if (info) showSceneProperty?.(info.scene_uid)
    })

    useRegisterCommand(
        CmdId.OpenObjByPath,
        (data: FileOpenedData | undefined): Promise<OpenResult> => {
            if (!data || !cm) return Promise.resolve({ loaded: false })
            // Return the promise so callers that await the dispatch (OS file
            // drop opens files sequentially) observe completion; existing
            // fire-and-forget callers are unaffected.
            return (async () => {
                try {
                    // Pass `data.contentFirst` here too -- the renderer-list
                    // lookup and the actual load must resolve to the same
                    // reader, otherwise (e.g.) the dialog offers density-map
                    // renderers for a coordinate CIF and the subsequent load
                    // crashes when the chosen renderer is applied to a MolCoord.
                    // When reopening from the MRU, data.readerName pins the
                    // reader the file was first opened with (skips sniff). For
                    // a fresh open it is undefined and the reader is sniffed.
                    const { types, objType, readerName } = await cm.getCompatibleRendererNames(
                        data.path, data.readerName, data.contentFirst,
                    )
                    // Empty types means the C++ side could not identify a
                    // compatible reader (or extracted no compatible renderer
                    // list). Surface this instead of opening the option
                    // dialog in a half-populated state.
                    if (types.length === 0) {
                        await showErrorAlert({
                            title: 'Cannot open file',
                            message: `Could not determine a compatible reader for:\n${data.path}\n\n` +
                                'The file may be corrupt, an unsupported format, or its extension does not match its content.',
                        })
                        return { loaded: false }
                    }
                    // Where this file goes. A batch pins every file after the
                    // first to the scene the first one used; otherwise the
                    // entry point's preference decides, and an absent target
                    // (File > Open, Open Recent) means the active scene.
                    const pinned = data.targetSceneId
                    const plan = pinned === undefined
                        ? await resolveOpenTarget(data.openTarget ?? 'active')
                        : undefined
                    const previewSceneId = pinned ?? plan?.previewSceneId ?? 0
                    // The scene is created by plan.commit() below, after the
                    // dialog is confirmed, so neither an unsupported file nor
                    // a cancel leaves a stray new tab behind.
                    const presetTypes = await fetchPresetTypes(cm, previewSceneId, objType)
                    const options = await showFileOpenOptionDialog({
                        filePath: data.path,
                        sceneId: previewSceneId,
                        rendererTypes: types,
                        presetTypes,
                        objType,
                        readerName,
                    })
                    if (options === null) return { loaded: false }
                    const sceneId = pinned ?? (await plan?.commit())?.scene_uid
                    if (sceneId === undefined) return { loaded: false }
                    // Pass the resolved readerName so the actual load uses the
                    // exact reader the dialog previewed (no re-sniff drift), and
                    // record it in the MRU so a future reopen reuses it.
                    const loaded = await cm.loadObject(data.path, sceneId, options, data.contentFirst, undefined, readerName)
                    if (!loaded.ok) {
                        await showErrorAlert({
                            title: 'Open File failed',
                            message: `Failed to open:\n${data.path}\n\n${loaded.error}`,
                        })
                        return { loaded: false }
                    }
                    addRecent(data.path, 'obj', readerName)
                    return { loaded: true, sceneId }
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e)
                    console.error('OpenObjByPath failed:', e)
                    await showErrorAlert({
                        title: 'Open File failed',
                        message: `Failed to open:\n${data.path}\n\n${msg}`,
                    })
                    return { loaded: false }
                }
            })()
        },
    )

    useRegisterCommand(
        CmdId.OpenSceneByPath,
        (path: string | undefined): Promise<OpenResult> => {
            if (!path) return Promise.resolve({ loaded: false })
            return openNewScene(path).catch((e: unknown) => {
                console.error('openNewScene failed:', e)
                return { loaded: false }
            })
        },
    )
}
