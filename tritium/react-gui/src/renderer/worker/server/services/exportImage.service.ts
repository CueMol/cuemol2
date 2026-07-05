/**
 * @file worker/server/services/exportImage.service.ts
 * @description Runs in the Web Worker thread. Exports the active scene to a
 * file via a chosen C++ scene exporter (category IOH_CAT_RENDTOFILE). Image
 * exporters (png / umbreon) render off-screen through the gfx::RenderTarget
 * (WebGL FBO) abstraction and read the pixels back; geometry exporters (stl /
 * mqo) and POV-Ray SDL (pov) write their own description files.
 *
 * Mirrors UXP `Qm2Main.exportScene` (`fileopen.js`): the exporter is chosen by
 * name (the renderer routes one menu item per file type), so no runtime
 * enumeration is needed here -- only the scene name + live view size used to
 * seed the file name and the image-options dialog.
 */
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull, getViewOrNull } from './helpers/sceneResolver';

export interface ExportSceneArgs {
    sceneId: number;
    viewId: number;
    filePath: string;
    /** Scene-exporter nickname (e.g. 'png', 'umbreon', 'pov', 'stl', 'mqo'). */
    exporterName: string;
    width: number;
    height: number;
    /** RGBA output with a transparent background (image exporters only). */
    alpha?: boolean;
    /** Output resolution metadata in DPI (UXP `exporter.resoln`, PNG only). */
    resoln?: number;
    /** Capture a depth visualization (grayscale) instead of the color. */
    depth?: boolean;
}

export interface ExportSceneResult {
    ok: boolean;
}

export interface GetSceneExportInfoArgs {
    sceneId: number;
    viewId: number;
}

export interface GetSceneExportInfoResult {
    ok: boolean;
    /** Scene name, used to seed the default export filename (UXP parity). */
    sceneName: string;
    /** Live view pixel size, used to seed the image-options dialog. */
    width: number;
    height: number;
}

/**
 * Read the scene name and live view pixel size so the renderer can seed the
 * export file name (scene name, UXP `removeFileExt(sc.name)`) and the image
 * options dialog (view.width / view.height, UXP `exportScene`).
 */
function getSceneExportInfo(
    ctx: WorkerContext,
    args: GetSceneExportInfoArgs,
): GetSceneExportInfoResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    const view = getViewOrNull(ctx, args.viewId) as GUIView | null;
    const sceneName = scene
        ? ((scene as unknown as { name: string }).name ?? '')
        : '';
    const width = view ? (view as unknown as { width: number }).width : 0;
    const height = view ? (view as unknown as { height: number }).height : 0;
    return { ok: !!scene && !!view, sceneName, width, height };
}

/** IOH_CAT_RENDTOFILE: render-to-file exporter category (qsys::InOutHandler). */
const IOH_CAT_RENDTOFILE = 2;

/**
 * Replace the extension of a path's basename with `ext` (no leading dot).
 * Used for exporters that emit a sibling file (UXP `pov` -> `.inc`). Cuts at
 * the final `.` of the basename; appends when there is none.
 */
function replaceExt(path: string, ext: string): string {
    const sep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    const dot = path.lastIndexOf('.');
    const base = dot > sep ? path.slice(0, dot) : path;
    return `${base}.${ext}`;
}

interface SceneExporterLike {
    width: number;
    height: number;
    alpha: boolean;
    depth: boolean;
    resoln: number;
    camera: string;
    attach: (scene: unknown) => void;
    setPath: (path: string) => void;
    setSubPath?: (key: string, path: string) => void;
    write: () => void;
    detach: () => void;
}

function exportScene(ctx: WorkerContext, args: ExportSceneArgs): ExportSceneResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };

    // Persist the live view into the transient '__current' camera so the
    // off-screen exporter renders from the active viewpoint (UXP parity).
    try {
        (scene as unknown as {
            saveViewToCam: (viewId: number, name: string) => boolean;
        }).saveViewToCam(args.viewId, '__current');
    } catch {
        // ignore -- proceed with whatever camera the exporter resolves
    }

    let exporter: SceneExporterLike | null;
    try {
        exporter = ctx.strMgr.createHandler(
            args.exporterName,
            IOH_CAT_RENDTOFILE,
        ) as unknown as SceneExporterLike | null;
    } catch {
        // createHandler throws when the exporter is not registered (e.g.
        // 'umbreon' in a build without HAVE_UMBREON).
        return { ok: false };
    }
    if (!exporter) return { ok: false };

    // Width / height apply to every exporter (image pixel size, or the
    // viewport the geometry exporters project from).
    exporter.width = args.width;
    exporter.height = args.height;
    // alpha / depth / resoln are image-exporter (png) metadata; guard each
    // setter so geometry exporters that lack them are not broken.
    try { exporter.alpha = args.alpha ?? false; } catch { /* non-image exporter */ }
    try { exporter.depth = args.depth ?? false; } catch { /* non-image exporter */ }
    if (args.resoln && args.resoln > 0) {
        try { exporter.resoln = args.resoln; } catch { /* PNG-only pHYs metadata */ }
    }
    exporter.camera = '__current';

    exporter.attach(scene);
    exporter.setPath(args.filePath);
    // POV-Ray writes a sibling include file alongside the .pov (UXP parity).
    if (args.exporterName === 'pov' && typeof exporter.setSubPath === 'function') {
        exporter.setSubPath('inc', replaceExt(args.filePath, 'inc'));
    }
    exporter.write();
    exporter.detach();

    return { ok: true };
}

export const services = { exportScene, getSceneExportInfo };
