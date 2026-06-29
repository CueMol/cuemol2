/**
 * @file hooks/sceneContextMenu/runSceneExportFlow.ts
 * @description Scene "Export" flow shared by the Rendering > Export scene
 * submenu commands (one menu item / command per file type).
 *
 * Mirrors UXP `Qm2Main.exportScene` (`fileopen.js`): seed the file name from
 * the scene name, show a native save dialog scoped to the chosen exporter's
 * extension, collect image options for image-type exporters, then write
 * through the worker. Because the exporter is fixed by the menu item, there is
 * no file-type picker and no Electron filter-index ambiguity (png vs umbreon
 * both `*.png`).
 */

import { IPC } from '../../../shared/ipcChannels'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type { ExportPngOptionsResult } from '../../components/dialogs/ExportPngOptionsDialog'

/** Static descriptor for a supported scene exporter (file type). */
interface SceneExporterDef {
    /** Native save-dialog filter label. */
    label: string
    /** File extension (no leading dot). */
    ext: string
    /** Image-type exporter -- collect size/alpha/dpi via the options dialog. */
    image: boolean
}

/**
 * Supported exporters, keyed by the C++ StreamManager nickname passed to
 * `createHandler(name, 2)`. Curated subset (UXP exposes more); png/umbreon are
 * image-type, pov/stl/mqo write geometry/SDL.
 */
export const SCENE_EXPORTERS: Record<string, SceneExporterDef> = {
    png: { label: 'PNG image', ext: 'png', image: true },
    umbreon: { label: 'Umbreon ray-traced image', ext: 'png', image: true },
    pov: { label: 'POV-Ray SDL', ext: 'pov', image: false },
    stl: { label: 'StereoLithography', ext: 'stl', image: false },
    mqo: { label: 'Metasequoia object', ext: 'mqo', image: false },
}

/** Callback that opens the image-options dialog (from `useShowExportPngOptionsDialog`). */
type ShowImageOptions = (args: {
    initialWidth: number
    initialHeight: number
}) => Promise<ExportPngOptionsResult | null>

/**
 * Run the full scene-export flow for a single exporter (file type).
 *
 * @param cm - the worker client
 * @param sceneId - active scene uid
 * @param viewId - active view id (live viewpoint -> '__current' camera)
 * @param exporterName - StreamManager nickname; must be a `SCENE_EXPORTERS` key
 * @param showImageOptions - opens the image-options dialog (image exporters only)
 * @returns true when a file was written, false on any early-out.
 */
export async function runSceneExportFlow(
    cm: AsyncCueMol,
    sceneId: number,
    viewId: number,
    exporterName: string,
    showImageOptions: ShowImageOptions,
): Promise<boolean> {
    const def = SCENE_EXPORTERS[exporterName]
    if (!def) {
        console.warn(`runSceneExportFlow: unknown exporter '${exporterName}'`)
        return false
    }

    // Seed the default file name from the scene name and the image options
    // from the live view size (UXP parity).
    const info = await cm.invokeService('getSceneExportInfo', { sceneId, viewId })
    const baseName = (info?.sceneName ?? '').trim() || 'scene'
    const viewW = info && info.width > 0 ? info.width : 1024
    const viewH = info && info.height > 0 ? info.height : 768

    // 1) choose the file (extension scoped to this exporter).
    const dlg = await window.electronAPI.invoke(IPC.DIALOG_SCENE_EXPORT, {
        defaultName: `${baseName}.${def.ext}`,
        filters: [{ name: def.label, extensions: [def.ext] }],
    })
    if (dlg.canceled || !dlg.filePath) return false

    // 2) collect image options for image-type exporters; geometry/SDL
    //    exporters use the live view size with no options dialog.
    let width = viewW
    let height = viewH
    let alpha = false
    let resoln: number | undefined
    if (def.image) {
        const opts = await showImageOptions({ initialWidth: viewW, initialHeight: viewH })
        if (!opts) return false
        width = opts.width
        height = opts.height
        alpha = opts.alpha
        resoln = opts.dpi
    }

    // 3) write through the chosen exporter.
    await cm.invokeService('exportScene', {
        sceneId,
        viewId,
        filePath: dlg.filePath,
        exporterName,
        width,
        height,
        alpha,
        resoln,
        depth: false,
    })
    return true
}
