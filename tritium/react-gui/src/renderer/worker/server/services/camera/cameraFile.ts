// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// camera file I/O.
//
// UXP source:
//   - loadCameraFromFile       -> workspace_panel.js  onCamLoadFile +
//                                  loadCamImpl (apply-to-view after load)
//   - saveCameraToFile (As)    -> workspace_panel.js  onCamSaveFileAs via
//                                  qm2_main.onSaveCamera -> scene.saveCameraTo
//   - saveCameraToCurrentSrc   -> workspace_panel.js  onCamSaveFile (uses
//                                  cam.src; caller falls back to save-as
//                                  when src is empty)
//   - reloadCameraFromSrc      -> workspace_panel.js  onCamReloadFile
//
// The renderer side owns the native file picker via the new
// DIALOG_CAMERA_OPEN / DIALOG_CAMERA_SAVE IPCs. The worker takes a
// resolved absolute path.

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Camera } from '@cuemol/core/src/wrappers/Camera';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { withUndoTxn } from '../withUndoTxn';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead';

function getCameraRef(scene: Scene, name: string): Camera | null {
    return (safeRead(() => scene.getCameraRef(name) as Camera | null)) ?? null;
}

function uniqueCameraName(scene: Scene, base: string): string {
    if (!scene.hasCamera(base)) return base;
    for (let i = 1; i < 10000; i++) {
        const candidate = `copy${i}_${base}`;
        if (!scene.hasCamera(candidate)) return candidate;
    }
    return `${base}_${Date.now()}`;
}

// --- loadCameraFromFile ---

export interface LoadCameraFromFileArgs {
    sceneId: number;
    /** Active view uid -- UXP also calls loadViewFromCam after load. */
    viewId: number;
    path: string;
}

export interface LoadCameraFromFileResult {
    ok: boolean;
    /** Final name after uniquification (UXP `copy{i}_<orig>` collision). */
    name: string;
}

export function loadCameraFromFile(
    ctx: WorkerContext,
    args: LoadCameraFromFileArgs,
): LoadCameraFromFileResult {
    const empty: LoadCameraFromFileResult = { ok: false, name: '' };
    if (args.path.length === 0) return empty;
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return empty;

    let cam: Camera | null;
    try { cam = scene.loadCamera(args.path) as Camera | null; }
    catch { return empty; }
    if (!cam) return empty;

    const wanted = safeRead(() => cam!.name) ?? 'camera';
    const finalName = uniqueCameraName(scene, wanted);

    let ok = false;
    withUndoTxn(scene, `Load camera file ${finalName}`, () => {
        scene.setCamera(finalName, cam);
        ok = true;
    });
    if (!ok) return empty;

    // UXP loadCamImpl applies the loaded camera to the active view + loads
    // vis settings. We replicate the apply-to-view; vis flags apply only
    // when present (mirrors aVisflags=true branch).
    try { scene.loadViewFromCam(args.viewId, finalName); } catch { /* ignore */ }
    try {
        const fresh = getCameraRef(scene, finalName);
        if (fresh && fresh.vis_size > 0) {
            withUndoTxn(scene, `Load camera ${finalName} settings`, () => {
                fresh.loadVisSettings(scene);
            });
        }
    } catch { /* ignore vis-flag apply errors */ }

    return { ok: true, name: finalName };
}

// --- saveCameraToFile (Save As) ---

export interface SaveCameraToFileArgs {
    sceneId: number;
    /** Camera name -- cameras are keyed by name, not uid. */
    name: string;
    path: string;
}

export interface SaveCameraToFileResult {
    ok: boolean;
}

export function saveCameraToFile(
    ctx: WorkerContext,
    args: SaveCameraToFileArgs,
): SaveCameraToFileResult {
    if (args.path.length === 0) return { ok: false };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };

    let ok = false;
    // UXP wraps Save As in an undo txn because saveCameraTo updates
    // `Camera.src` as a side-effect. Match that.
    withUndoTxn(scene, "Change camera's source", () => {
        ok = scene.saveCameraTo(args.name, args.path);
    });
    return { ok };
}

// --- saveCameraToCurrentSrc ---

export interface SaveCameraToCurrentSrcArgs {
    sceneId: number;
    name: string;
}

export interface SaveCameraToCurrentSrcResult {
    ok: boolean;
    /** True if there was a src and we wrote to it; false -> caller does Save As. */
    saved: boolean;
}

export function saveCameraToCurrentSrc(
    ctx: WorkerContext,
    args: SaveCameraToCurrentSrcArgs,
): SaveCameraToCurrentSrcResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, saved: false };
    const cam = getCameraRef(scene, args.name);
    if (!cam) return { ok: false, saved: false };

    const src = safeRead(() => cam.src) ?? '';
    if (!src) return { ok: true, saved: false };

    let ok = false;
    withUndoTxn(scene, 'Save camera file', () => {
        ok = scene.saveCameraTo(args.name, src);
    });
    return { ok, saved: ok };
}

// --- reloadCameraFromSrc ---
//
// UXP `onCamReloadFile`. Loads from cam.src and re-registers under the
// existing name (no uniquification -- we are overwriting).

export interface ReloadCameraFromSrcArgs {
    sceneId: number;
    name: string;
}

export interface ReloadCameraFromSrcResult {
    ok: boolean;
}

export function reloadCameraFromSrc(
    ctx: WorkerContext,
    args: ReloadCameraFromSrcArgs,
): ReloadCameraFromSrcResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const cam = getCameraRef(scene, args.name);
    if (!cam) return { ok: false };
    const src = safeRead(() => cam.src) ?? '';
    if (!src) return { ok: false };

    let newcam: Camera | null;
    try { newcam = scene.loadCamera(src) as Camera | null; }
    catch { return { ok: false }; }
    if (!newcam) return { ok: false };

    let ok = false;
    withUndoTxn(scene, `Reload camera file ${args.name}`, () => {
        scene.setCamera(args.name, newcam);
        ok = true;
    });
    return { ok };
}
