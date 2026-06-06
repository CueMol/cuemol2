/**
 * @file worker/server/services/exportImage.service.ts
 * @description Runs in the Web Worker thread. Renders the active scene to an
 * image file via the C++ ImgSceneExporter / PngSceneExporter, which renders
 * off-screen through the gfx::RenderTarget (WebGL FBO) abstraction and reads
 * the pixels back. This is the same portable exporter used by the OpenGL build.
 */
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull } from './helpers/sceneResolver';

export interface ExportImageArgs {
    sceneId: number;
    viewId: number;
    filePath: string;
    width: number;
    height: number;
    /** RGBA output with a transparent background. */
    alpha?: boolean;
    /** Capture a depth visualization (grayscale) instead of the color. */
    depth?: boolean;
}

export interface ExportImageResult {
    ok: boolean;
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
    exporter.camera = '__current';

    exporter.attach(scene);
    exporter.setPath(args.filePath);
    exporter.write();
    exporter.detach();

    return { ok: true };
}

export const services = { exportImage };
