/**
 * @file worker/shared/calls/camera.ts
 * @description ServiceMap slice: cameras: create, apply, save/load, visibility flags.
 *
 * One row per registered worker service. `CAMERA_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  LoadCameraFromFileArgs,
  LoadCameraFromFileResult,
  ReloadCameraFromSrcArgs,
  ReloadCameraFromSrcResult,
  SaveCameraToCurrentSrcArgs,
  SaveCameraToCurrentSrcResult,
  SaveCameraToFileArgs,
  SaveCameraToFileResult,
} from '@renderer/worker/server/services/camera/cameraFile'
import type {
  ApplyCameraToViewArgs,
  ApplyCameraToViewResult,
  ClearCameraVisFlagsArgs,
  ClearCameraVisFlagsResult,
  CreateCameraArgs,
  CreateCameraResult,
  DestroyCameraArgs,
  DestroyCameraResult,
  RenameCameraArgs,
  RenameCameraResult,
  SaveViewToCameraArgs,
  SaveViewToCameraResult,
} from '@renderer/worker/server/services/camera/cameraOps'
import type {
  GetCameraVisFlagsArgs,
  GetCameraVisFlagsResult,
  SetCameraVisFlagsArgs,
  SetCameraVisFlagsResult,
} from '@renderer/worker/server/services/camera/cameraVisFlags'

export interface CameraCalls {
  createCamera:               { args: CreateCameraArgs; result: CreateCameraResult }
  destroyCamera:              { args: DestroyCameraArgs; result: DestroyCameraResult }
  renameCamera:               { args: RenameCameraArgs; result: RenameCameraResult }
  saveViewToCamera:           { args: SaveViewToCameraArgs; result: SaveViewToCameraResult }
  applyCameraToView:          { args: ApplyCameraToViewArgs; result: ApplyCameraToViewResult }
  clearCameraVisFlags:        { args: ClearCameraVisFlagsArgs; result: ClearCameraVisFlagsResult }
  getCameraVisFlags:          { args: GetCameraVisFlagsArgs; result: GetCameraVisFlagsResult }
  setCameraVisFlags:          { args: SetCameraVisFlagsArgs; result: SetCameraVisFlagsResult }
  loadCameraFromFile:         { args: LoadCameraFromFileArgs; result: LoadCameraFromFileResult }
  saveCameraToFile:           { args: SaveCameraToFileArgs; result: SaveCameraToFileResult }
  saveCameraToCurrentSrc:     { args: SaveCameraToCurrentSrcArgs; result: SaveCameraToCurrentSrcResult }
  reloadCameraFromSrc:        { args: ReloadCameraFromSrcArgs; result: ReloadCameraFromSrcResult }
}

export const CAMERA_KEYS = [
  'createCamera',
  'destroyCamera',
  'renameCamera',
  'saveViewToCamera',
  'applyCameraToView',
  'clearCameraVisFlags',
  'getCameraVisFlags',
  'setCameraVisFlags',
  'loadCameraFromFile',
  'saveCameraToFile',
  'saveCameraToCurrentSrc',
  'reloadCameraFromSrc',
] as const satisfies readonly (keyof CameraCalls)[]
