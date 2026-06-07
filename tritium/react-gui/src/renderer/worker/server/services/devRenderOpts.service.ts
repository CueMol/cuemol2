/**
 * @file services/devRenderOpts.service.ts
 * @description TEMPORARY developer affordance for bringing up the off-screen
 * AO/AA render pipeline on the WebGL2 backend. Lets a tester flip the scene's
 * `aoEnabled` flag (and optionally the `aa_method`) at runtime from the devtools
 * console while a proper GUI control is still being ported.
 *
 * Runs in the Web Worker thread (C++ wrappers are synchronous). Setting the
 * scene properties calls setUpdateFlag() in C++, so the RAF render loop redraws
 * automatically -- no explicit redraw needed.
 *
 * Usage from the renderer devtools console (cm is exposed on window in dev):
 *   await window.__cm.invokeService('devRenderOpts', { viewId: <id>, aoEnabled: true })
 *   await window.__cm.invokeService('devRenderOpts', { viewId: <id>, aaMethod: 'none' })
 *   await window.__cm.invokeService('devRenderOpts', { viewId: <id> })  // toggles AO
 *
 * Remove this file (and its ServiceMap row + the window.__cm hook) once the
 * pipeline ships with real UI controls.
 */
import type { WorkerContext } from '../types/WorkerContext';
import { getViewSceneOrNull } from './helpers/sceneResolver';

export type AaMethodName = 'none' | 'fxaa' | 'smaa';

export interface DevRenderOptsArgs {
    viewId: number;
    /** Explicit AO enable; omit to toggle the current value. */
    aoEnabled?: boolean;
    /** Optional spatial AA method. */
    aaMethod?: AaMethodName;
}

export interface DevRenderOptsResult {
    ok: boolean;
    aoEnabled: boolean;
    aaMethod: string;
}

function devRenderOpts(ctx: WorkerContext, args: DevRenderOptsArgs): DevRenderOptsResult {
    const vs = getViewSceneOrNull(ctx, args.viewId);
    if (!vs) return { ok: false, aoEnabled: false, aaMethod: 'none' };
    const { scene } = vs;

    const nextAo = args.aoEnabled !== undefined ? args.aoEnabled : !scene.aoEnabled;
    scene.aoEnabled = nextAo;
    if (args.aaMethod !== undefined) {
        // enum properties accept their string id at runtime (typed as number).
        scene.aa_method = args.aaMethod as unknown as number;
    }

    return {
        ok: true,
        aoEnabled: scene.aoEnabled,
        aaMethod: scene.aa_method as unknown as string,
    };
}

export const services = { devRenderOpts };
