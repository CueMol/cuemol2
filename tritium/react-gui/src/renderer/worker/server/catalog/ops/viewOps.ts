/**
 * @file worker/server/catalog/ops/viewOps.ts
 * @description Ops that move the camera.
 *
 * The view is not part of the undo history (turning the molecule with the
 * mouse is not an edit), so these do not mark the scene as changed.
 */

import {
  getViewXform,
  rotateView as rotateViewService,
  setViewXform,
} from '@renderer/worker/server/services/view/viewXform'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { listSceneObjects } from '@renderer/worker/server/services/scene/listSceneObjects'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { defineOp } from '../op'
import type { OpOutcome } from '../op'
import { boolean, enumOf, objectId, optional, real, vec3 } from '../params'

export const rotateView = defineOp({
  name: 'rotate_view',
  description:
    'Turn the view about a screen axis: x runs left to right, y bottom to top, z out of the ' +
    'screen toward the viewer. Use it to show the structure from another side; capture_view ' +
    'tells you which way it went.',
  params: {
    axis: enumOf(['x', 'y', 'z'], 'Screen axis to turn about.'),
    angle: real('Angle in degrees; negative turns the other way.'),
  },
  mutates: false,
  expose: { tool: 'core', console: true },
  verbs: [{ verb: 'turn', summary: 'Turn the view about a screen axis: turn y, 90' }],
  run(ctx, args, oc) {
    const res = rotateViewService(ctx, {
      viewId: oc.viewId,
      rotX: args.axis === 'x' ? args.angle : 0,
      rotY: args.axis === 'y' ? args.angle : 0,
      rotZ: args.axis === 'z' ? args.angle : 0,
    })
    return res.ok ? { ok: true } : { ok: false, error: 'The view could not be read.' }
  },
})

/** A wrapper with x, y, z, as Vector is; enough for the arithmetic here. */
interface XYZ {
  x: number
  y: number
  z: number
}

/** What fitting the slab needs of the view and of an object. */
interface ViewLike {
  center: XYZ
  rotation: { toMatrix(): { mulvec(v: XYZ): XYZ } }
}
interface BoundedLike {
  getBoundBoxMin(fsel: boolean): XYZ
  getBoundBoxMax(fsel: boolean): XYZ
}

/** Margin added to a fitted slab, as a fraction of it, so the edge is not on an atom. */
const SLAB_MARGIN = 0.1

/**
 * The slab depth that takes in every corner of the objects' bounding boxes,
 * measured along the line of sight from the view's own centre.
 *
 * The depth is about the centre, so it is twice the farthest corner. The
 * rotation is the one `MolCoord::fitView` uses (`Quat.toMatrix` is
 * `Matrix4D::makeRotMat`), so "along the line of sight" means the same here.
 *
 * @returns the depth, or why there is nothing to fit.
 */
function fittedSlab(ctx: WorkerContext, sceneId: number, viewId: number, objId: number | null): number | string {
  const view = ctx.sceMgr.getView(viewId) as unknown as ViewLike | null
  const scene = getSceneOrNull(ctx, sceneId)
  if (!view || !scene) return 'The view could not be read.'
  const rot = view.rotation.toMatrix()
  const cz = rot.mulvec(view.center).z

  const ids = objId !== null ? [objId] : listSceneObjects(ctx, { sceneId }).objects.map((o) => o.uid)
  let far = -1
  for (const id of ids) {
    const obj = scene.getObject(id) as unknown as Partial<BoundedLike> | null
    // Only an object with atoms has a box to fit; a map or a surface is skipped.
    if (!obj || typeof obj.getBoundBoxMin !== 'function' || typeof obj.getBoundBoxMax !== 'function') continue
    const lo = obj.getBoundBoxMin(false)
    const hi = obj.getBoundBoxMax(false)
    for (const x of [lo.x, hi.x]) for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) {
      const v = ctx.svc.createObj('Vector') as unknown as XYZ
      v.x = x
      v.y = y
      v.z = z
      far = Math.max(far, Math.abs(rot.mulvec(v).z - cz))
    }
  }
  if (far < 0) return objId !== null ? 'That object has no atoms to fit.' : 'There are no molecules to fit.'
  return 2 * far * (1 + SLAB_MARGIN)
}

/** The view's camera as an op reports it. */
function viewState(ctx: WorkerContext, viewId: number): OpOutcome {
  const x = getViewXform(ctx, { viewId })
  if (!x.ok) return { ok: false, error: 'The view could not be read.' }
  const r = (v: number) => Math.round(v * 100) / 100
  return {
    ok: true,
    data: {
      zoom: r(x.zoom),
      slab: r(x.slab),
      distance: r(x.distance),
      center: [r(x.centerX), r(x.centerY), r(x.centerZ)],
    },
  }
}

export const setView = defineOp({
  name: 'set_view',
  description:
    'Read or change the camera without moving to a selection: zoom (the height of the view, ' +
    'in angstroms), slab (the depth that is drawn, about the centre; atoms outside it are ' +
    'clipped), distance (from the eye to the centre), and centre. Give only what should ' +
    'change; with nothing given it just reports the current values. fitSlab sets the slab so ' +
    'every molecule (or objId) is in it while keeping the centre and zoom as they are -- use ' +
    'it, not center_view, when only the clipping is wrong.',
  params: {
    zoom: optional(real('New zoom in angstroms. Null leaves it.')),
    slab: optional(real('New slab depth in angstroms. Null leaves it.')),
    distance: optional(real('New eye-to-centre distance in angstroms. Null leaves it.')),
    center: optional(vec3('New centre [x, y, z] in angstroms. Null leaves it.')),
    fitSlab: optional(boolean('True fits the slab to the molecules. Do not also give slab.')),
    objId: optional(objectId('With fitSlab: fit to this object only. Null fits every molecule.')),
  },
  // The camera is not part of the undo history, as with the mouse.
  mutates: false,
  expose: { tool: 'core', console: true },
  verbs: [
    { verb: 'view', summary: 'Print the camera: zoom, slab, distance, centre.' },
    { verb: 'slab', order: ['slab'], summary: 'Set the slab depth: slab 30' },
    { verb: 'fit_slab', fixed: { fitSlab: true }, order: ['objId'], summary: 'Fit the slab to the molecules, keeping centre and zoom.' },
  ],
  format(data) {
    const d = data as { zoom: number; slab: number; distance: number; center: number[] }
    return [`zoom ${d.zoom}  slab ${d.slab}  distance ${d.distance}  center (${d.center.join(', ')})`]
  },
  run(ctx, args, oc) {
    if (args.fitSlab && args.slab !== null) {
      return { ok: false, error: 'Give either slab or fitSlab, not both.' }
    }
    let slab = args.slab
    if (args.fitSlab) {
      const fitted = fittedSlab(ctx, oc.sceneId, oc.viewId, args.objId)
      if (typeof fitted === 'string') return { ok: false, error: fitted }
      slab = fitted
    }
    const anything = args.zoom !== null || slab !== null || args.distance !== null || args.center !== null
    if (anything) {
      const res = setViewXform(ctx, {
        viewId: oc.viewId,
        ...(args.zoom !== null ? { zoom: args.zoom } : {}),
        ...(slab !== null ? { slab } : {}),
        ...(args.distance !== null ? { distance: args.distance } : {}),
        ...(args.center !== null ? { center: { x: args.center[0], y: args.center[1], z: args.center[2] } } : {}),
      })
      if (!res.ok) return { ok: false, error: 'The view could not be changed.' }
    }
    return viewState(ctx, oc.viewId)
  },
})

export const VIEW_OPS = [rotateView, setView]
