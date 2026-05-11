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
import { useShowGetPdbDialog } from '../components/dialogs/GetPdbDialogProvider'
import type { CoordServerType, MapServerType } from '../components/dialogs/GetPdbDialog'
import { useStreamProgressDialog, type StreamProgressApi } from '../components/dialogs/StreamProgressDialogProvider'
import { pushHistory as pushPdbIdHistory } from '../components/dialogs/pdbIdHistory'
import type { NewSceneAction } from '../hooks/useNewSceneAction'

interface UseSceneCommandsOptions {
    cm: AsyncCueMol | null
    getActiveSceneInfo: () => { scene_uid: number; view_id: number } | null | undefined
    onBgColorChanged?: (bgColor: SceneBgColor) => void
    newScene: NewSceneAction
}

export function useSceneCommands({
    cm,
    getActiveSceneInfo,
    onBgColorChanged,
    newScene,
}: UseSceneCommandsOptions): void {

    const showFileOpenOptionDialog = useShowFileOpenOptionDialog()
    const showGetPdbDialog = useShowGetPdbDialog()
    const streamProgress = useStreamProgressDialog()

    const openNewScene = useCallback(async (filePath?: string): Promise<void> => {
        if (!cm) return
        // Same path as app launch and File > New Tab (UXP onNewScene).
        const created = await newScene()
        if (!created) return
        if (filePath) {
            await cm.loadScene(filePath, created.scene_uid)
        }
    }, [cm, newScene])

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
                const { types, objType } = await cm.getCompatibleRendererNames(data.path)
                const options = await showFileOpenOptionDialog({
                    filePath: data.path,
                    sceneId: info.scene_uid,
                    rendererTypes: types,
                    objType,
                })
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

    useRegisterCommand(
        CmdId.UiGetPdbDialog,
        () => {
            if (!cm) return
            const info = getActiveSceneInfo()
            if (!info) return
            ;(async () => {
                const inputs = await showGetPdbDialog()
                if (!inputs) return

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
                    } else {
                        const options = await showFileOpenOptionDialog({
                            filePath: virtualFilename,
                            sceneId: info.scene_uid,
                            rendererTypes,
                            objType,
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
                        console.error('Get PDB chain item failed:', e)
                        break
                    }
                }
            })().catch((e: unknown) => console.error('UiGetPdbDialog handler failed:', e))
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
