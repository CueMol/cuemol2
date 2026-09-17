// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Camera list and display order for the Camera pane.
//
// The order lives on the C++ Camera as `ui_order`, the same scheme objects and
// renderers use: the slot is (nopersist), so it is never written as a qsc
// attribute -- `Scene::camerasWriteTo` emits the <camera> elements in slot
// order and the load path re-assigns slots in the order it reads them.
// `Scene::getCameraInfoJSON` already returns the entries in that order, so
// nothing here sorts.

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Camera } from '@cuemol/core/src/wrappers/Camera';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { undoTxnResult } from '../withUndoTxn';
import { fail, ok, type Result } from '@renderer/worker/shared/result';
import { CURRENT_CAMERA_NAME, type CameraEntry } from '@renderer/worker/shared/cameraTypes';

/** Undo label of a drag-and-drop reorder in the Camera pane. */
export const REORDER_CAMERAS_UNDO_LABEL = 'Reorder cameras';

interface CameraInfoJSONEntry {
    name?: string;
    src?: string;
    vis_size?: number;
    ui_order?: number;
}

/** Cameras of the scene as the C++ side reports them, in `ui_order`. */
function parseCameraInfo(scene: Scene): CameraEntry[] {
    try {
        const json = scene.getCameraInfoJSON();
        if (!json) return [];
        const parsed = JSON.parse(json) as CameraInfoJSONEntry[];
        if (!Array.isArray(parsed)) return [];
        const out: CameraEntry[] = [];
        for (const e of parsed) {
            const name = e.name ?? '';
            if (name.length === 0) continue;
            out.push({
                name,
                src: e.src ?? '',
                visSize: typeof e.vis_size === 'number' ? e.vis_size : 0,
                uiOrder: typeof e.ui_order === 'number' ? e.ui_order : -1,
            });
        }
        return out;
    } catch {
        return [];
    }
}

/**
 * The rows of the Camera pane: `__current` first, then the user's cameras in
 * the order they arranged (which is what C++ already returns).
 *
 * Pinning is a display rule rather than a slot, so `__current` never competes
 * for a position with the cameras the user does order.
 */
export function cameraEntries(scene: Scene): CameraEntry[] {
    const all = parseCameraInfo(scene);
    const current = all.filter((e) => e.name === CURRENT_CAMERA_NAME);
    const rest = all.filter((e) => e.name !== CURRENT_CAMERA_NAME);
    return [...current, ...rest];
}

// --- listCameras ---

export interface ListCamerasArgs {
    sceneId: number;
}

export type ListCamerasResult = Result<{ cameras: CameraEntry[] }>;

export function listCameras(ctx: WorkerContext, args: ListCamerasArgs): ListCamerasResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail(`scene ${args.sceneId} not found`, 'not-found');
    return ok({ cameras: cameraEntries(scene) });
}

// --- reorderCameras ---

export interface ReorderCamerasArgs {
    sceneId: number;
    /** The complete pane order after the drop, top row first. */
    names: string[];
}

export type ReorderCamerasResult = Result<{ names: string[]; changed: boolean }>;

/**
 * Write the pane's order back to the cameras' `ui_order` slots.
 *
 * The caller sends the whole list rather than a move, because a flat list has
 * no per-parent bubble to do (unlike the scene tree's `reorderSceneNode`).
 * Names that are not cameras any more are dropped and cameras the caller left
 * out are appended, so a stale pane can never make a camera disappear from the
 * order. `__current` is pinned to the top by the display rule, so it takes no
 * slot here whatever the caller sends. A drop that changes nothing commits no
 * transaction: an empty commit would clear the user's redo stack.
 *
 * @returns the resulting order as the pane shows it (pinned row included).
 */
export function reorderCameras(ctx: WorkerContext, args: ReorderCamerasArgs): ReorderCamerasResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail(`scene ${args.sceneId} not found`, 'not-found');

    const shown = cameraEntries(scene);
    const orderable = shown.filter((e) => e.name !== CURRENT_CAMERA_NAME).map((e) => e.name);
    const known = new Set(orderable);
    const wanted = [...new Set(args.names)].filter((n) => known.has(n));
    for (const n of orderable) {
        if (!wanted.includes(n)) wanted.push(n);
    }

    const unchanged =
        wanted.length === orderable.length && wanted.every((n, i) => n === orderable[i]);
    const pinned = shown.filter((e) => e.name === CURRENT_CAMERA_NAME).map((e) => e.name);
    if (unchanged) return ok({ names: [...pinned, ...wanted], changed: false });

    return undoTxnResult(scene, REORDER_CAMERAS_UNDO_LABEL, () => {
        wanted.forEach((name, index) => {
            // getCamera returns a copy (vis settings included); writing it back
            // through setCamera is what records the undo info and fires
            // `cameraChanged`, so no new Scene API is needed for a reorder.
            const cam = scene.getCamera(name) as Camera | null;
            if (!cam) return;
            if (cam.ui_order === index) return;
            cam.ui_order = index;
            scene.setCamera(name, cam);
        });
        return ok({ names: [...pinned, ...wanted], changed: true });
    });
}
