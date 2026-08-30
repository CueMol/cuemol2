// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// camera ctxmenu operations.
//
// Cameras are keyed by **name** at the Scene API level (`scene.{get,set,
// has,destroy}Camera(name)`), not by uid. The tree-row id for synthesised
// camera nodes is a small negative integer with no relation to the Camera
// object -- every worker service here takes `cameraName: string` from the
// renderer side instead of `nodeId: number`.
//
// UXP source for each handler:
//   - createCamera           -> workspace_panel.js  ws.createCamera
//   - destroyCamera          -> workspace_panel.js  ws.destroyCamera
//   - renameCamera           -> workspace_panel.js  ws.onRenameCamera
//                              (atomic destroyCamera + setCamera since
//                               there is no name setter on a registered cam)
//   - applyCameraToView      -> workspace_panel.js  ws.loadCamImpl (visflags=false)
//   - saveViewToCamera       -> workspace_panel.js  ws.saveCamImpl (visflags=false)
//   - applyCameraWithVis     -> workspace_panel.js  ws.loadCamImpl (visflags=true)
//   - saveCameraWithVis      -> workspace_panel.js  ws.saveCamImpl (visflags=true)
//   - clearCameraVisFlags    -> workspace_panel.js  ws.onClearVisFlags

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Camera } from '@cuemol/core/src/wrappers/Camera';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';

// --- helpers ---

function getCameraRef(scene: Scene, name: string): Camera | null {
    try { return (scene.getCameraRef(name) as Camera | null) ?? null; }
    catch { return null; }
}

// --- createCamera ---

export interface CreateCameraArgs {
    sceneId: number;
    viewId: number;
    /** User-confirmed name. Worker rejects empty / already-taken names. */
    name: string;
}

export interface CreateCameraResult {
    ok: boolean;
}

function createCamera(ctx: WorkerContext, args: CreateCameraArgs): CreateCameraResult {
    const trimmed = args.name.trim();
    if (trimmed.length === 0) return { ok: false };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    if (scene.hasCamera(trimmed)) return { ok: false };

    let ok = false;
    withUndoTxn(scene, `Create camera: ${trimmed}`, () => {
        ok = scene.saveViewToCam(args.viewId, trimmed);
    });
    return { ok };
}

// --- destroyCamera ---

export interface DestroyCameraArgs {
    sceneId: number;
    name: string;
}

export interface DestroyCameraResult {
    ok: boolean;
}

function destroyCamera(ctx: WorkerContext, args: DestroyCameraArgs): DestroyCameraResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    if (!scene.hasCamera(args.name)) return { ok: false };

    let ok = false;
    withUndoTxn(scene, `Destroy camera: ${args.name}`, () => {
        ok = scene.destroyCamera(args.name);
    });
    return { ok };
}

// --- renameCamera ---
//
// UXP `onRenameCamera`: cameras have no in-place name setter once
// registered. The rename runs `destroyCamera(old) + setCamera(new, cam)`
// atomically in one undo txn, after rejecting a no-op or an already-taken
// destination name.

export interface RenameCameraArgs {
    sceneId: number;
    oldName: string;
    newName: string;
}

export interface RenameCameraResult {
    ok: boolean;
}

function renameCamera(ctx: WorkerContext, args: RenameCameraArgs): RenameCameraResult {
    const trimmed = args.newName.trim();
    if (trimmed.length === 0) return { ok: false };
    if (trimmed === args.oldName) return { ok: false };

    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    if (scene.hasCamera(trimmed)) return { ok: false };
    const cam = getCameraRef(scene, args.oldName);
    if (!cam) return { ok: false };

    let ok = false;
    withUndoTxn(scene, `Rename camera ${args.oldName}`, () => {
        scene.destroyCamera(args.oldName);
        scene.setCamera(trimmed, cam);
        ok = true;
    });
    return { ok };
}

// --- saveViewToCamera (Save from view) ---

export interface SaveViewToCameraArgs {
    sceneId: number;
    viewId: number;
    name: string;
    /** When true also calls `cam.saveVisSettings(scene)` (UXP "with vis flags"). */
    withVisFlags?: boolean;
}

export interface SaveViewToCameraResult {
    ok: boolean;
}

function saveViewToCamera(
    ctx: WorkerContext,
    args: SaveViewToCameraArgs,
): SaveViewToCameraResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };

    let ok = false;
    withUndoTxn(scene, `Change camera ${args.name}`, () => {
        scene.saveViewToCam(args.viewId, args.name);
        if (args.withVisFlags) {
            const cam = getCameraRef(scene, args.name);
            cam?.saveVisSettings(scene);
        }
        ok = true;
    });
    return { ok };
}

// --- applyCameraToView (Apply to view) ---
//
// UXP `loadCamImpl`. With visflags=true, the load-vis-settings step is
// wrapped in its own undo txn -- we mirror that even though it nests under
// the implicit outer "navigation" no-txn for symmetry with UXP.

export interface ApplyCameraToViewArgs {
    sceneId: number;
    viewId: number;
    name: string;
    withVisFlags?: boolean;
}

export interface ApplyCameraToViewResult {
    ok: boolean;
}

function applyCameraToView(
    ctx: WorkerContext,
    args: ApplyCameraToViewArgs,
): ApplyCameraToViewResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    if (!scene.hasCamera(args.name)) return { ok: false };

    // The view-camera transfer itself isn't undoable in UXP (camera apply
    // is a navigation, not a scene mutation). Vis-settings apply is.
    try { scene.loadViewFromCam(args.viewId, args.name); }
    catch { return { ok: false }; }

    if (args.withVisFlags) {
        const cam = getCameraRef(scene, args.name);
        if (cam && cam.vis_size > 0) {
            withUndoTxn(scene, `Load camera ${args.name} settings`, () => {
                cam.loadVisSettings(scene);
            });
        }
    }
    return { ok: true };
}

// --- clearCameraVisFlags ---

export interface ClearCameraVisFlagsArgs {
    sceneId: number;
    name: string;
}

export interface ClearCameraVisFlagsResult {
    ok: boolean;
}

function clearCameraVisFlags(
    ctx: WorkerContext,
    args: ClearCameraVisFlagsArgs,
): ClearCameraVisFlagsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const cam = getCameraRef(scene, args.name);
    if (!cam) return { ok: false };
    if (cam.vis_size === 0) return { ok: false };

    let ok = false;
    withUndoTxn(scene, `Clear visibility flags in ${args.name}`, () => {
        cam.clearVisSettings();
        ok = true;
    });
    return { ok };
}

export const services = {
    createCamera,
    destroyCamera,
    renameCamera,
    saveViewToCamera,
    applyCameraToView,
    clearCameraVisFlags,
};
