/**
 * @file worker/server/services/camera/camera.service.ts
 * @description Cameras: the registry entry.
 *
 * A camera is a named viewpoint stored in the scene. These services create
 * and apply them, read and write their visibility flags, and move them
 * between a scene and a file.
 */

import { loadCameraFromFile, reloadCameraFromSrc, saveCameraToCurrentSrc, saveCameraToFile } from './cameraFile';
import { applyCameraToView, clearCameraVisFlags, createCamera, destroyCamera, renameCamera, saveViewToCamera } from './cameraOps';
import { getCameraVisFlags, setCameraVisFlags } from './cameraVisFlags';

export const services = {
    loadCameraFromFile,
    saveCameraToFile,
    saveCameraToCurrentSrc,
    reloadCameraFromSrc,
    createCamera,
    destroyCamera,
    renameCamera,
    saveViewToCamera,
    applyCameraToView,
    clearCameraVisFlags,
    getCameraVisFlags,
    setCameraVisFlags,
};

export type * from './cameraFile';
export type * from './cameraOps';
export type * from './cameraVisFlags';
