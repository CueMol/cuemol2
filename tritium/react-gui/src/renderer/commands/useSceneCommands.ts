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
import type { ActiveSceneCommandDeps } from './commandTypes'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { addRecent } from './addRecent'
import { useShowFileOpenOptionDialog } from '../components/fopen-opt-dlgs/FileOpenOptionDialogProvider'
import { useShowGetPdbDialog } from '../components/dialogs/GetPdbDialogProvider'
import { useShowErrorAlert } from '../components/dialogs/ErrorAlertDialogProvider'
import { useShowOpenMdTrajDialog } from '../components/dialogs/OpenMdTrajDialogProvider'
import { useShowNewRendererDialog } from '../components/dialogs/NewRendererDialogProvider'
import type { CoordServerType, MapServerType } from '../components/dialogs/GetPdbDialog'
import { useStreamProgressDialog, type StreamProgressApi } from '../components/dialogs/StreamProgressDialogProvider'
import { pushHistory as pushPdbIdHistory } from '../components/dialogs/pdbIdHistory'
import type { PresetTypeEntry } from '../components/fopen-opt-dlgs/types'
import type { NewSceneAction } from '../hooks/useNewSceneAction'

/**
 * Fetch the renderer presets (`<objType>-rendpreset` styles) for the
 * file-open option dialog. Called AFTER ensureActiveScene() because the
 * renderer-type lookup itself runs before a scene exists. Presets are
 * optional decoration -- any failure (including test mocks resolving
 * undefined) degrades to an empty list.
 */
async function fetchPresetTypes(
    cm: AsyncCueMol,
    sceneId: number,
    objType: string | undefined,
): Promise<PresetTypeEntry[]> {
    if (!objType) return []
    try {
        const r = await cm.invokeService('getRendPresetTypes', {
            sceneId,
            objClassName: objType,
        })
        return r?.presets ?? []
    } catch {
        return []
    }
}

interface UseSceneCommandsOptions {
    cm: AsyncCueMol | null
    getActiveSceneInfo: ActiveSceneCommandDeps
    onBgColorChanged?: (bgColor: SceneBgColor) => void
    /** Open the active scene in the generic property inspector (Scene > Properties...). */
    showSceneProperty?: (sceneId: number) => void
    newScene: NewSceneAction
}

export function useSceneCommands({
    cm,
    getActiveSceneInfo,
    onBgColorChanged,
    showSceneProperty,
    newScene,
}: UseSceneCommandsOptions): void {

    const showFileOpenOptionDialog = useShowFileOpenOptionDialog()
    const showGetPdbDialog = useShowGetPdbDialog()
    const showErrorAlert = useShowErrorAlert()
    const showOpenMdTrajDialog = useShowOpenMdTrajDialog()
    const showNewRendererDialog = useShowNewRendererDialog()
    const streamProgress = useStreamProgressDialog()

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
                    await cm.loadScene(filePath, active.scene_uid)
                    addRecent(filePath, 'scene')
                    return
                }
            }
        }
        // Same path as app launch and File > New Tab (UXP onNewScene).
        const created = await newScene()
        if (!created) return
        if (filePath) {
            await cm.loadScene(filePath, created.scene_uid)
            addRecent(filePath, 'scene')
        }
    }, [cm, newScene, getActiveSceneInfo])

    useRegisterCommand(CmdId.SceneNew, () => openNewScene())

    // Resolve the active scene/view, creating a fresh scene + view (a new tab)
    // when none is active (welcome tab, or every molview tab closed). UXP always
    // kept an active view, so a load always had somewhere to go; tritium has no
    // implicit scene, so the load commands below create one on demand instead of
    // silently doing nothing.
    const ensureActiveScene = useCallback(async (): Promise<
        { scene_uid: number; view_id: number } | undefined
    > => {
        const info = getActiveSceneInfo()
        if (info) return info
        const created = await newScene()
        if (!created) return undefined
        return { scene_uid: created.scene_uid, view_id: created.view_uid }
    }, [getActiveSceneInfo, newScene])

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
        await cm.invokeService('toggleSceneColorProofing', { sceneId: info.scene_uid })
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
            ;(async () => {
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
                    await cm.loadObject(data.path, info.scene_uid, options, data.contentFirst, undefined, readerName)
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
                await cm.loadTrajectory({
                    sceneId: info.scene_uid,
                    topologyPath: picked.topologyPath,
                    trajPaths: picked.trajPaths,
                    nevery: picked.nevery,
                    renderer: rend.rendOpts,
                })
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
            openNewScene(path).catch((e: unknown) =>
                console.error('openNewScene failed:', e),
            )
        },
    )

    useRegisterCommand(
        CmdId.UiGetPdbDialog,
        () => {
            if (!cm) return
            ;(async () => {
                const inputs = await showGetPdbDialog()
                if (!inputs) return

                // Resolve the target scene after the dialog is confirmed (so a
                // cancel never leaves a stray new tab), creating a new scene +
                // view when none is active.
                const info = await ensureActiveScene()
                if (!info) return

                // Persist the accepted PDB ID to the dropdown history (LRU,
                // dedup, capped) so future invocations can quickly recall it.
                pushPdbIdHistory(inputs.pdbid)

                const tasks: Array<() => Promise<{ canceled?: boolean; ok: boolean }>> = []

                // Coord task: same flow as Open File... + pre-resolved readerName.
                if (inputs.coord) {
                    const { url, readerName, ext } = pickCoordUrl(inputs.pdbid, inputs.coord.serverType)
                    const virtualFilename = `${inputs.pdbid}.${ext}`
                    // Pass readerName explicitly so the renderer-list lookup matches the
                    // load reader. Skipping it re-introduces the .cif ambiguity
                    // (mmcifmap wins by JSON order).
                    const { types: rendererTypes, objType } = await cm.getCompatibleRendererNames(virtualFilename, readerName)
                    if (!rendererTypes || rendererTypes.length === 0) {
                        console.warn(`Get PDB: no compatible renderer for ${virtualFilename}`)
                        await showErrorAlert({
                            title: 'Get PDB failed',
                            message: `Could not find a compatible reader for the requested PDB:\n${virtualFilename}\n\n` +
                                'The selected server type may not provide this entry, or the format is unsupported.',
                        })
                    } else {
                        const presetTypes = await fetchPresetTypes(cm, info.scene_uid, objType)
                        const options = await showFileOpenOptionDialog({
                            filePath: virtualFilename,
                            sceneId: info.scene_uid,
                            rendererTypes,
                            presetTypes,
                            objType,
                            readerName,
                        })
                        if (options !== null) {
                            tasks.push(() => streamWithProgress(
                                cm, streamProgress,
                                `Downloading ${inputs.pdbid}…`,
                                (reqId) => cm.invokeService('streamLoadFromUrl', {
                                    reqId, url, readerName,
                                    objectName: inputs.pdbid,
                                    sceneId: info.scene_uid,
                                    options,
                                }),
                            ))
                        }
                    }
                }

                // 2Fo-Fc / Fo-Fc tasks: skip FileOpenOptionDialog, use preset
                // contour color/sigma in the worker (UXP openMapImpl).
                const buildMapTask = (server: MapServerType, mapType: '2fofc' | 'fofc') => {
                    const { url, readerName, gzip } = pickMapUrl(inputs.pdbid, server, mapType)
                    const objectName = `${inputs.pdbid}_${mapType}`
                    return () => streamWithProgress(
                        cm, streamProgress,
                        `Downloading ${objectName}…`,
                        (reqId) => cm.invokeService('streamLoadDensityMap', {
                            reqId, url, readerName, gzip, mapType,
                            objectName,
                            sceneId: info.scene_uid,
                            viewId: info.view_id,
                        }),
                    )
                }
                if (inputs.map2fofc) tasks.push(buildMapTask(inputs.map2fofc.serverType, '2fofc'))
                if (inputs.mapFofc)  tasks.push(buildMapTask(inputs.mapFofc.serverType,  'fofc'))

                // Run sequentially. Stop the chain on user cancel or HTTP/error.
                for (const task of tasks) {
                    try {
                        const result = await task()
                        if (result.canceled) break
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e)
                        console.error('Get PDB chain item failed:', e)
                        await showErrorAlert({
                            title: 'Get PDB failed',
                            message: `A download or load step failed:\n\n${msg}`,
                        })
                        break
                    }
                }
            })().catch(async (e: unknown) => {
                const msg = e instanceof Error ? e.message : String(e)
                console.error('UiGetPdbDialog handler failed:', e)
                await showErrorAlert({
                    title: 'Get PDB failed',
                    message: msg,
                })
            })
        },
    )
}

// ---------------------------------------------------------------------------
// Helpers (exported for testability)
// ---------------------------------------------------------------------------

interface CoordUrlSpec {
    url: string;
    readerName: string;
    ext: string;
}

export function pickCoordUrl(pdbid: string, server: CoordServerType): CoordUrlSpec {
    switch (server) {
        case 'RCSB_CIF':
            return {
                url: `https://files.rcsb.org/download/${pdbid}.cif`,
                readerName: 'mmcif',
                ext: 'cif',
            }
        case 'RCSB_PDB':
            return {
                url: `https://files.rcsb.org/download/${pdbid}.pdb`,
                readerName: 'pdb',
                ext: 'pdb',
            }
    }
}

interface MapUrlSpec {
    url: string;
    readerName: 'mmcifmap' | 'mtzmap';
    gzip: boolean;
}

export function pickMapUrl(
    pdbid: string,
    server: MapServerType,
    mapType: '2fofc' | 'fofc',
): MapUrlSpec {
    if (server === 'EBI_MTZ') {
        return {
            url: `https://www.ebi.ac.uk/pdbe/coordinates/files/${pdbid}_map.mtz`,
            readerName: 'mtzmap',
            gzip: false,
        }
    }
    // RCSB_CIF: validation_reports cif.gz. mid = middle two chars of pdbid.
    const mid = pdbid.substring(1, 3)
    const suffix = mapType === '2fofc' ? '2fo-fc' : 'fo-fc'
    return {
        url: `https://files.rcsb.org/pub/pdb/validation_reports/${mid}/${pdbid}/${pdbid}_validation_${suffix}_map_coef.cif.gz`,
        readerName: 'mmcifmap',
        gzip: true,
    }
}

function makeReqId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `getpdb-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Show the streaming progress dialog, subscribe to progress events, invoke
 * the worker service, and tear everything down on the way out. Used by
 * both the coord and density-map paths in the Get PDB chain.
 */
async function streamWithProgress(
    cm: AsyncCueMol,
    streamProgress: StreamProgressApi,
    title: string,
    invoke: (reqId: string) => Promise<{ ok: boolean; canceled?: boolean }>,
): Promise<{ ok: boolean; canceled?: boolean }> {
    const reqId = makeReqId()
    streamProgress.show({
        title,
        onCancel: () => {
            cm.invokeService('cancelStreamLoad', { reqId })
                .catch((e: unknown) => console.warn('cancelStreamLoad invoke failed:', e))
        },
    })
    const unsub = cm.subscribeStreamProgress((id, bytes) => {
        if (id === reqId) streamProgress.update(bytes)
    })
    try {
        return await invoke(reqId)
    } finally {
        unsub()
        streamProgress.hide()
    }
}
