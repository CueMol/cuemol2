/**
 * @file worker/shared/cameraTypes.ts
 * @description Boundary types for the named cameras of a scene.
 *
 * Both threads name these: the worker builds the rows, the Camera pane draws
 * them. Cameras are addressed by name everywhere (the Scene API has no uid for
 * them -- see ADR-0005), so a row carries no id. Every camera of the scene is
 * a row, `__current` included, as it was in UXP.
 */

/**
 * The viewpoint the scene loader writes on save and applies on load.
 *
 * It is listed like any other camera (UXP did the same), but pinned to the top
 * of the list and left out of the user's ordering: it is not one of the named
 * viewpoints the user arranges, it is where the scene opens, so it belongs in
 * a fixed place where it can always be found.
 */
export const CURRENT_CAMERA_NAME = '__current';

/** One row of the Camera pane, mirroring `Scene::getCameraInfoJSON`. */
export interface CameraEntry {
    name: string;
    /** Path of the linked `.cam` file; '' for a camera saved from a view. */
    src: string;
    /** Number of stored visibility-flag entries (C++ `vis_size`). */
    visSize: number;
    /**
     * Display-order slot (C++ `Camera.ui_order`). Entries already arrive in
     * this order; the value is carried so a reorder can tell which cameras
     * actually have to move.
     */
    uiOrder: number;
}
