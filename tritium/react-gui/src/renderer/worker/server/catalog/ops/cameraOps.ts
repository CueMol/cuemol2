/**
 * @file worker/server/catalog/ops/cameraOps.ts
 * @description Ops for named cameras (saved views), the projection, and
 * panning: the camera side of the View activity, for a caller with no mouse.
 */

import { listCameras as listCamerasService } from '@renderer/worker/server/services/camera/cameraOrder'
import {
  applyCameraToView,
  createCamera,
  destroyCamera,
} from '@renderer/worker/server/services/camera/cameraOps'
import { getViewProjection, setViewProjection } from '@renderer/worker/server/services/view/viewProjection'
import { translateView } from '@renderer/worker/server/services/view/viewXform'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import { boolean, optional, real, string } from '../params'

export const listCameras = defineOp({
  name: 'list_cameras',
  description: 'List the named cameras (saved views) of the scene, in display order.',
  params: {},
  mutates: false,
  expose: { tool: 'view', console: true },
  aliases: [{ name: 'cameras', summary: 'List the saved views.' }],
  format: (data) => (data as { cameras: { name: string }[] }).cameras.map((c) => c.name),
  run(ctx, _args, oc) {
    const res = listCamerasService(ctx, { sceneId: oc.sceneId })
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, data: { cameras: res.cameras.map((c) => ({ name: c.name })) } }
  },
})

export const saveCamera = defineOp({
  name: 'save_camera',
  description:
    'Save the current view as a named camera, so it can be restored later with apply_camera. ' +
    'An existing camera of that name is overwritten.',
  params: {
    name: string('Name of the camera.'),
  },
  mutates: true,
  expose: { tool: 'view', console: true },
  aliases: [{ name: 'save_view', summary: 'Save the current view under a name: save_view front' }],
  run(ctx, args, oc) {
    const res = createCamera(ctx, { sceneId: oc.sceneId, viewId: oc.viewId, name: args.name })
    if (!res.ok) return { ok: false, error: 'The camera could not be saved. Give a non-empty name.' }
    return { ok: true, data: { name: args.name.trim(), overwritten: res.overwritten } }
  },
})

export const applyCamera = defineOp({
  name: 'apply_camera',
  description: 'Move the view to a named camera saved earlier (see list_cameras).',
  params: {
    name: string('Name of the camera, from list_cameras.'),
  },
  // The view is not part of the undo history.
  mutates: false,
  expose: { tool: 'view', console: true },
  aliases: [{ name: 'restore_view', summary: 'Go to a saved view: restore_view front' }],
  run(ctx, args, oc) {
    const res = applyCameraToView(ctx, { sceneId: oc.sceneId, viewId: oc.viewId, name: args.name })
    return normalizeServiceResult(res, `No camera named "${args.name}". Call list_cameras for the names.`)
  },
})

export const deleteCamera = defineOp({
  name: 'delete_camera',
  description: 'Delete a named camera.',
  params: {
    name: string('Name of the camera, from list_cameras.'),
  },
  mutates: true,
  expose: { tool: 'view', console: true },
  run(ctx, args, oc) {
    const res = destroyCamera(ctx, { sceneId: oc.sceneId, name: args.name })
    return normalizeServiceResult(res, `No camera named "${args.name}".`)
  },
})

export const setProjection = defineOp({
  name: 'set_projection',
  description:
    'Switch the view between perspective and orthographic projection. With nothing given it ' +
    'reports which one is in use.',
  params: {
    perspective: optional(boolean('True for perspective, false for orthographic. Null only reports.')),
  },
  mutates: false,
  expose: { tool: 'view', console: true },
  aliases: [{ name: 'projection', summary: 'Show or set the projection: projection false' }],
  run(ctx, args, oc) {
    const res = args.perspective === null
      ? getViewProjection(ctx, { viewId: oc.viewId })
      : setViewProjection(ctx, { viewId: oc.viewId, perspective: args.perspective })
    if (!res.ok) return { ok: false, error: 'The view could not be read.' }
    return { ok: true, data: { perspective: res.perspective } }
  },
})

export const panView = defineOp({
  name: 'pan_view',
  description:
    'Slide the view without turning it: x moves the scene right, y up, z toward the viewer, in ' +
    'screen units (about one pixel each at the current zoom). Use center_view to go to a ' +
    'selection instead.',
  params: {
    dx: real('Shift along screen x.'),
    dy: real('Shift along screen y.'),
    dz: optional(real('Shift along the line of sight. Null leaves the depth.')),
  },
  mutates: false,
  expose: { tool: 'view', console: true },
  aliases: [{ name: 'pan', summary: 'Slide the view: pan 10, 0' }],
  run(ctx, args, oc) {
    const res = translateView(ctx, { viewId: oc.viewId, dx: args.dx, dy: args.dy, dz: args.dz ?? 0, dragging: false })
    if (!res.ok) return { ok: false, error: 'The view could not be read.' }
    return { ok: true, data: { center: [res.centerX, res.centerY, res.centerZ] } }
  },
})

export const CAMERA_OPS = [listCameras, saveCamera, applyCamera, deleteCamera, setProjection, panView]
