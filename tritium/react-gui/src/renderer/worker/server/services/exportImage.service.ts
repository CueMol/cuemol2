/**
 * @file worker/server/services/exportImage.service.ts
 * @description Runs in the Web Worker thread. Renders the active scene to an
 * image file via the C++ ImgSceneExporter / PngSceneExporter, which renders
 * off-screen through the gfx::RenderTarget (WebGL FBO) abstraction and reads
 * the pixels back. This is the same portable exporter used by the OpenGL build.
 */
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull, getViewOrNull } from './helpers/sceneResolver';

export interface ExportImageArgs {
    sceneId: number;
    viewId: number;
    filePath: string;
    width: number;
    height: number;
    /** RGBA output with a transparent background. */
    alpha?: boolean;
    /** Output resolution metadata in DPI (UXP `exporter.resoln`). */
    resoln?: number;
    /** Capture a depth visualization (grayscale) instead of the color. */
    depth?: boolean;
}

export interface ExportImageResult {
    ok: boolean;
}

export interface GetExportImageInfoArgs {
    sceneId: number;
    viewId: number;
}

export interface GetExportImageInfoResult {
    ok: boolean;
    /** Scene name, used to seed the default export filename (UXP parity). */
    sceneName: string;
    /** Live view pixel size, used to seed the PNG options dialog. */
    width: number;
    height: number;
}

/**
 * Read the scene name and live view pixel size so the renderer can seed the
 * export file name (scene name, UXP `removeFileExt(sc.name)`) and the PNG
 * options dialog (view.width / view.height, UXP `exportScene`).
 */
function getExportImageInfo(
    ctx: WorkerContext,
    args: GetExportImageInfoArgs,
): GetExportImageInfoResult {
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

function exportImage(ctx: WorkerContext, args: ExportImageArgs): ExportImageResult {
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

    const exporter = ctx.strMgr.createHandler('png', IOH_CAT_RENDTOFILE) as unknown as {
        width: number;
        height: number;
        alpha: boolean;
        depth: boolean;
        resoln: number;
        camera: string;
        attach: (scene: unknown) => void;
        setPath: (path: string) => void;
        write: () => void;
        detach: () => void;
    } | null;
    if (!exporter) return { ok: false };

    exporter.width = args.width;
    exporter.height = args.height;
    exporter.alpha = args.alpha ?? false;
    exporter.depth = args.depth ?? false;
    if (args.resoln && args.resoln > 0) {
        try {
            exporter.resoln = args.resoln;
        } catch {
            // resoln is PNG-only metadata (pHYs); ignore if unsupported.
        }
    }
    exporter.camera = '__current';

    exporter.attach(scene);
    exporter.setPath(args.filePath);
    exporter.write();
    exporter.detach();

    return { ok: true };
}

export const services = { exportImage, getExportImageInfo };
