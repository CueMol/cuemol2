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
import { useShowOpenMdTrajDialog } from '@renderer/dialogs/OpenMdTrajDialogProvider'
import { useShowNewRendererDialog } from '@renderer/dialogs/NewRendererDialogProvider'
import { fetchPresetTypes } from '@renderer/features/file-io/fetchPresetTypes'
import { makeEnsureActiveScene } from '@renderer/hooks/useEnsureActiveScene'
import type { NewSceneAction, OpenSceneFileAction } from '@renderer/hooks/useNewSceneAction'

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
    const showOpenMdTrajDialog = useShowOpenMdTrajDialog()
    const showNewRendererDialog = useShowNewRendererDialog()

    const openNewScene = useCallback(async (filePath?: string): Promise<void> => {
        if (!cm) return
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
                        return
                    }
                    addRecent(filePath, 'scene')
                    return
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
                return
            }
            addRecent(filePath, 'scene')
            return
        }
        // File > New Scene: same path as app launch (UXP onNewScene).
        await newScene()
    }, [cm, newScene, openSceneFile, getActiveSceneInfo, showErrorAlert])

    useRegisterCommand(CmdId.SceneNew, () => openNewScene())

    // Resolve the active scene/view, creating a fresh scene + view (a new tab)
    // when none is active. Same resolver the plugins that load something of
    // their own use -- see hooks/useEnsureActiveScene.ts.
    const ensureActiveScene = useMemo(
        () => makeEnsureActiveScene(getActiveSceneInfo, newScene),
        [getActiveSceneInfo, newScene],
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
        (data: FileOpenedData | undefined) => {
            if (!data) return
            if (!cm) return
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
                        return
                    }
                    // Resolve the target scene only after the file is known to be
                    // loadable, so an unsupported file does not leave a stray new
                    // tab. Creates a new scene + view when none is active.
                    const info = await ensureActiveScene()
                    if (!info) return
                    const presetTypes = await fetchPresetTypes(cm, info.scene_uid, objType)
                    const options = await showFileOpenOptionDialog({
                        filePath: data.path,
                        sceneId: info.scene_uid,
                        rendererTypes: types,
                        presetTypes,
                        objType,
                        readerName,
                    })
                    if (options === null) return
                    // Pass the resolved readerName so the actual load uses the
                    // exact reader the dialog previewed (no re-sniff drift), and
                    // record it in the MRU so a future reopen reuses it.
                    const loaded = await cm.loadObject(data.path, info.scene_uid, options, data.contentFirst, undefined, readerName)
                    if (!loaded.ok) {
                        await showErrorAlert({
                            title: 'Open File failed',
                            message: `Failed to open:\n${data.path}\n\n${loaded.error}`,
                        })
                        return
                    }
                    addRecent(data.path, 'obj', readerName)
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e)
                    console.error('OpenObjByPath failed:', e)
                    await showErrorAlert({
                        title: 'Open File failed',
                        message: `Failed to open:\n${data.path}\n\n${msg}`,
                    })
                }
            })()
        },
    )

    // MD trajectory open flow (File > Open MD Trajectory...). Two-step,
    // deferred load: collect topology + trajectory files (dialog 1), pick the
    // initial renderer (dialog 2), then load everything in one undo txn. The
    // actual load runs only after both dialogs are confirmed, so cancelling
    // either one loads nothing -- matching the normal object-open flow.
    useRegisterCommand(CmdId.UiOpenTrajDialog, () => {
        if (!cm) return
        ;(async () => {
            try {
                const picked = await showOpenMdTrajDialog({})
                if (!picked) return
                // Resolve/create the target scene only after files are chosen,
                // mirroring OpenObjByPath (no stray tab on cancel-before-this).
                const info = await ensureActiveScene()
                if (!info) return
                // Compatible renderers for a Trajectory object -- probes an
                // empty Trajectory, no file is loaded yet.
                const rendInfo = await cm.getTrajectoryRendererInfo()
                if (rendInfo.types.length === 0) {
                    await showErrorAlert({
                        title: 'Cannot open trajectory',
                        message: 'No compatible renderer was found for Trajectory objects.',
                    })
                    return
                }
                const objName =
                    picked.topologyPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'trajectory'
                const rend = await showNewRendererDialog({
                    sceneId: info.scene_uid,
                    objName,
                    objClassName: rendInfo.objClassName || 'Trajectory',
                    rendererTypes: rendInfo.types,
                    defaultName: '',
                    isMol: true,
                })
                if (!rend) return
                const loaded = await cm.loadTrajectory({
                    sceneId: info.scene_uid,
                    topologyPath: picked.topologyPath,
                    trajPaths: picked.trajPaths,
                    nevery: picked.nevery,
                    renderer: rend.rendOpts,
                })
                if (!loaded.ok) {
                    await showErrorAlert({
                        title: 'Open MD Trajectory failed',
                        message: `Failed to open trajectory:\n${loaded.error}`,
                    })
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                console.error('OpenMdTraj failed:', e)
                await showErrorAlert({
                    title: 'Open MD Trajectory failed',
                    message: `Failed to open trajectory:\n${msg}`,
                })
            }
        })()
    })

    useRegisterCommand(
        CmdId.OpenSceneByPath,
        (path: string | undefined) => {
            if (!path) return
            return openNewScene(path).catch((e: unknown) =>
                console.error('openNewScene failed:', e),
            )
        },
    )
}
