/**
 * @file worker/server/catalog/ops/cameraOps.ts
 * @description Ops for named cameras (saved views), the projection, and
 * panning: the camera side of the View activity, for a caller with no mouse.
 */

import { listCameras as listCamerasService, reorderCameras } from '@renderer/worker/server/services/camera/cameraOrder'
import {
  applyCameraToView,
  clearCameraVisFlags,
  createCamera,
  destroyCamera,
  renameCamera,
  saveViewToCamera,
} from '@renderer/worker/server/services/camera/cameraOps'
import { loadCameraFromFile, reloadCameraFromSrc, saveCameraToCurrentSrc, saveCameraToFile } from '@renderer/worker/server/services/camera/cameraFile'
import { setCameraVisFlags } from '@renderer/worker/server/services/camera/cameraVisFlags'
import type { VisFlagEntry } from '@renderer/worker/server/services/camera/cameraVisFlags'
import { getViewProjection, setViewProjection } from '@renderer/worker/server/services/view/viewProjection'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { translateView } from '@renderer/worker/server/services/view/viewXform'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { numbered } from '@renderer/worker/shared/numbered'
import { CURRENT_CAMERA_NAME } from '@renderer/worker/shared/cameraTypes'
import { MOVE_DEST_PARAMS, moveTarget, moveText } from '../moveDest'
import { VIEW_UNREADABLE } from '../errors'
import { defineOp } from '../op'
import { boolean, optional, path, real, string } from '../params'
import { callerPath, outputPath } from '../outputFile'
import { resolveRef } from '../refs'
import type { OpOutcome } from '../op'

export const listCameras = defineOp({
  name: 'list_cameras',
  description: 'List the named cameras (saved views) of the scene, in display order.',
  params: {},
  mutates: false,
  expose: { tool: 'view', console: true },
  group: 'viewing',
  aliases: [{ name: 'cameras', summary: 'List the saved views.' }],
  format: (data) => (data as { cameras: { number: number; name: string }[] }).cameras.map((c) => `${c.number}  ${c.name}`),
  run(ctx, _args, oc) {
    const res = listCamerasService(ctx, { sceneId: oc.sceneId })
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, data: { cameras: numbered(res.cameras.map((c) => ({ name: c.name }))) } }
  },
})

export const saveCamera = defineOp({
  name: 'save_camera',
  description:
    'Save the current view as a named camera, so it can be restored later with apply_camera. ' +
    'An existing camera of that name is overwritten.',
  params: {
    name: string('Name of the camera.'),
    withVisibility: optional(boolean('Also remember which objects and renderers are shown. Null is false.')),
  },
  mutates: true,
  describe: (a) => `Save camera ${a.name}`,
  expose: { tool: 'view', console: true },
  group: 'viewing',
  aliases: [{ name: 'save_view', summary: 'Save the current view under a name: save_view front' }],
  run(ctx, args, oc) {
    const res = createCamera(ctx, { sceneId: oc.sceneId, viewId: oc.viewId, name: args.name })
    if (!res.ok) return { ok: false, error: 'The camera could not be saved. Give a non-empty name.' }
    if (args.withVisibility) {
      const vis = saveViewToCamera(ctx, { sceneId: oc.sceneId, viewId: oc.viewId, name: args.name.trim(), withVisFlags: true })
      if (!vis.ok) return { ok: false, error: 'The camera was saved, but its visibility could not be.' }
    }
    return { ok: true, data: { name: args.name.trim(), overwritten: res.overwritten } }
  },
})

export const applyCamera = defineOp({
  name: 'apply_camera',
  description: 'Move the view to a named camera saved earlier (see list_cameras).',
  params: {
    name: string('Name of the camera, from list_cameras.'),
    withVisibility: optional(boolean('Also show and hide objects as the camera remembers. Null is false.')),
  },
  // The view is not part of the undo history; the visibility it may apply is.
  mutates: false,
  describe: (a) => `Go to camera ${a.name}`,
  replay: true,
  expose: { tool: 'view', console: true },
  group: 'viewing',
  aliases: [{ name: 'restore_view', summary: 'Go to a saved view: restore_view front' }],
  run(ctx, args, oc) {
    const withVisFlags = args.withVisibility === true
    if (withVisFlags) oc.markMutated()
    const res = applyCameraToView(ctx, { sceneId: oc.sceneId, viewId: oc.viewId, name: args.name, withVisFlags })
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
  describe: (a) => `Delete camera ${a.name}`,
  expose: { tool: 'view', console: true },
  group: 'viewing',
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
  replay: (args) => args.perspective !== null && args.perspective !== undefined,
  expose: { tool: 'view', console: true },
  group: 'viewing',
  aliases: [{ name: 'projection', summary: 'Show or set the projection: projection false' }],
  run(ctx, args, oc) {
    const res = args.perspective === null
      ? getViewProjection(ctx, { viewId: oc.viewId })
      : setViewProjection(ctx, { viewId: oc.viewId, perspective: args.perspective })
    if (!res.ok) return { ok: false, error: VIEW_UNREADABLE }
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
  describe: () => 'Pan the view',
  replay: true,
  expose: { tool: 'view', console: true },
  group: 'viewing',
  aliases: [{ name: 'pan', summary: 'Slide the view: pan 10, 0' }],
  run(ctx, args, oc) {
    const res = translateView(ctx, { viewId: oc.viewId, dx: args.dx, dy: args.dy, dz: args.dz ?? 0, dragging: false })
    if (!res.ok) return { ok: false, error: VIEW_UNREADABLE }
    return { ok: true, data: { center: [res.centerX, res.centerY, res.centerZ] } }
  },
})

export const renameCameraOp = defineOp({
  name: 'rename_camera',
  description: 'Rename a camera.',
  params: {
    name: string('Name of the camera, from list_cameras.'),
    newName: string('Its new name.'),
  },
  mutates: true,
  describe: (a) => `Rename camera ${a.name} to ${a.newName}`,
  expose: { tool: false, console: true, mcp: true },
  group: 'viewing',
  format: () => [],
  run(ctx, args, oc) {
    return normalizeServiceResult(
      renameCamera(ctx, { sceneId: oc.sceneId, oldName: args.name, newName: args.newName }),
      `"${args.name}" could not be renamed (is there such a camera, and is the new name free?).`,
    )
  },
})

export const moveCamera = defineOp({
  name: 'move_camera',
  description: 'Move a camera to another place in the camera list (its number in list_cameras, from 1).',
  params: {
    name: string('Name of the camera, from list_cameras.'),
    ...MOVE_DEST_PARAMS,
  },
  mutates: true,
  describe: (a) => `Move camera ${a.name} ${moveText(a)}`,
  expose: { tool: false, console: true, mcp: true },
  group: 'viewing',
  format: () => [],
  run(ctx, args, oc) {
    const list = listCamerasService(ctx, { sceneId: oc.sceneId })
    if (!list.ok) return { ok: false, error: list.error }
    const names = list.cameras.map((c) => c.name)
    const from = names.indexOf(args.name)
    if (from < 0) return { ok: false, error: `No camera named "${args.name}".` }
    // The pinned current-view row stays on top, so nothing moves above it.
    const pinned = names.filter((n) => n === CURRENT_CAMERA_NAME).length
    const to = moveTarget(args, from, names.length, 'list_cameras', pinned)
    if (typeof to === 'string') return { ok: false, error: to }
    names.splice(from, 1)
    names.splice(to, 0, args.name)
    return normalizeServiceResult(reorderCameras(ctx, { sceneId: oc.sceneId, names }), 'The cameras could not be reordered.')
  },
})

/** `"on 1crn; off 1crn/cartoon1"` as the rows the visibility editor sends, or why it is not. */
function readVisEntries(ctx: WorkerContext, sceneId: number, text: string): VisFlagEntry[] | string {
  const out: VisFlagEntry[] = []
  for (const part of text.split(';').map((p) => p.trim()).filter((p) => p !== '')) {
    // The flag first: a node's name may hold spaces, and `=` would read as a named argument.
    const m = /^(on|off)\s+(.+)$/.exec(part)
    if (!m) return `"${part}" is not "on <node>" or "off <node>".`
    const hit = resolveRef(ctx, sceneId, m[2], 'node')
    if (!hit.ok) return `${m[2]}: ${hit.error}`
    out.push({ tgtId: hit.node.id, tgtName: hit.node.name, isObj: hit.node.type === 'object', included: true, visible: m[1] === 'on' })
  }
  return out
}

export const setCameraVisibility = defineOp({
  name: 'set_camera_visibility',
  description:
    'Set which objects and renderers a camera shows or hides when applied with its visibility ' +
    '(the camera\'s Edit visibility flags). Nodes left out are not touched by the camera.',
  params: {
    name: string('Name of the camera, from list_cameras.'),
    entries: string('The nodes and their visibility, e.g. "on 1crn; off 1crn/cartoon1". Empty clears them.'),
  },
  mutates: true,
  describe: (a) => `Set the visibility flags of camera ${a.name}`,
  expose: { tool: false, console: true, mcp: true },
  group: 'viewing',
  format: () => [],
  run(ctx, args, oc) {
    const entries = readVisEntries(ctx, oc.sceneId, args.entries)
    if (typeof entries === 'string') return { ok: false, error: entries }
    return normalizeServiceResult(setCameraVisFlags(ctx, { sceneId: oc.sceneId, cameraName: args.name, entries }), `No camera named "${args.name}".`)
  },
})

export const clearCameraVisibility = defineOp({
  name: 'clear_camera_visibility',
  description: 'Forget the visibility flags a camera keeps.',
  params: { name: string('Name of the camera, from list_cameras.') },
  mutates: true,
  describe: (a) => `Clear the visibility flags of camera ${a.name}`,
  expose: { tool: false, console: true, mcp: true },
  group: 'viewing',
  format: () => [],
  run(ctx, args, oc) {
    return normalizeServiceResult(clearCameraVisFlags(ctx, { sceneId: oc.sceneId, name: args.name }), `"${args.name}" has no visibility flags (or there is no such camera).`)
  },
})

export const loadCameraFile = defineOp({
  name: 'load_camera_file',
  description: 'Load a camera file as a new camera, and apply it to the view (with its visibility flags, if it keeps any).',
  params: { path: path('The camera file (.xml).') },
  mutates: true,
  describe: (a) => `Load camera file ${a.path}`,
  expose: { tool: false, console: true, mcp: true },
  group: 'viewing',
  format: (r) => [`camera ${String((r as { name?: string }).name ?? '')}`],
  run(ctx, args, oc): OpOutcome {
    const res = loadCameraFromFile(ctx, { sceneId: oc.sceneId, viewId: oc.viewId, path: callerPath(args.path) })
    return res.ok ? { ok: true, data: { name: res.name } } : { ok: false, error: `${args.path} could not be loaded as a camera file.` }
  },
})

export const saveCameraFile = defineOp({
  name: 'save_camera_file',
  description: 'Save a camera to a file. Null path writes it back to the file it came from.',
  params: {
    name: string('Name of the camera, from list_cameras.'),
    path: optional(path('Where to write it (.xml). Null uses its source file.')),
  },
  mutates: true,
  describe: (a) => `Save camera ${a.name}${a.path === null ? '' : ` to ${a.path}`}`,
  expose: { tool: false, console: true, mcp: true },
  group: 'viewing',
  format: () => [],
  run(ctx, args, oc): OpOutcome {
    if (args.path === null) {
      const res = saveCameraToCurrentSrc(ctx, { sceneId: oc.sceneId, name: args.name })
      if (res.ok && !res.saved) return { ok: false, error: `"${args.name}" has no source file; give a path.` }
      return normalizeServiceResult(res, `"${args.name}" could not be saved (is there such a camera?).`)
    }
    const out = outputPath(oc, args.path, '.xml')
    if ('error' in out) return { ok: false, error: out.error }
    return normalizeServiceResult(saveCameraToFile(ctx, { sceneId: oc.sceneId, name: args.name, path: out.path }), `"${args.name}" could not be saved to ${out.path}.`)
  },
})

export const reloadCamera = defineOp({
  name: 'reload_camera',
  description: 'Read a camera again from the file it came from.',
  params: { name: string('Name of the camera, from list_cameras.') },
  mutates: true,
  describe: (a) => `Reload camera ${a.name}`,
  expose: { tool: false, console: true, mcp: true },
  group: 'viewing',
  format: () => [],
  run(ctx, args, oc) {
    return normalizeServiceResult(reloadCameraFromSrc(ctx, { sceneId: oc.sceneId, name: args.name }), `"${args.name}" could not be reloaded (no such camera, or no source file).`)
  },
})

export const CAMERA_OPS = [
  listCameras, saveCamera, applyCamera, deleteCamera, setProjection, panView, renameCameraOp, moveCamera,
  setCameraVisibility, clearCameraVisibility, loadCameraFile, saveCameraFile, reloadCamera,
]
