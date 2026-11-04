/**
 * @file plugins/chimerax-console/worker/camera.ts
 * @description Fitting the view to what a specification names, across molecules.
 *
 * ChimeraX `view` frames everything named at once, keeping the direction
 * the camera looks (`std_commands/src/view.py`). CueMol's own fit
 * (`MolCoord::fitView`) belongs to one molecule and frames its current
 * selection, so it can neither take several molecules nor leave the
 * selection alone. The range is worked out here instead -- read only: the
 * atoms of each molecule's expression, in the view's own axes -- and
 * written with the `set_view` op, centre, zoom and slab together.
 *
 * The arithmetic is `MolCoord::fitView`'s (`MolCoordGeomImpl.cpp`): the box
 * grown by 20% a side, no axis thinner than 4 A, the zoom from the box's
 * width or height by the view's aspect, the slab the box's depth.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
// Read-only helpers: compiling a selection and walking its atoms is no
// operation of its own (op-catalog.md 3.1).
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'
import type { Target } from './display'

interface Vec {
  x: number
  y: number
  z: number
}

interface AtomIter {
  target: unknown
  sel: unknown
  first(): void
  next(): void
  hasMore(): boolean
  get(): { pos: Vec }
}

interface ViewAxes {
  width: number
  height: number
  right_vec: Vec
  up_vec: Vec
  forward_vec: Vec
}

/** `fitView`'s minimum extent of an axis, in angstroms. */
const MIN_EXTENT = 4.0

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z

/** What `set_view` is given: the centre, zoom and slab that frame the targets. */
export interface Framing {
  center: [number, number, number]
  zoom: number
  slab: number
}

/**
 * The framing of every target's atoms together, or null when they hold no
 * atom (the view is then left alone, as `fitView` does).
 */
export function framingOf(ctx: WorkerContext, sceneId: number, viewId: number, targets: readonly Target[]): Framing | null {
  const view = ctx.sceMgr.getView(viewId) as unknown as ViewAxes | null
  const scene = getSceneOrNull(ctx, sceneId)
  if (!view || !scene) return null
  const axes = [view.right_vec, view.up_vec, view.forward_vec]
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const t of targets) {
    const mol = scene.getObject(t.obj.uid)
    const sel = makeSel(ctx, t.sel, sceneId)
    const iter = ctx.svc.createObj('AtomIterator') as unknown as AtomIter | null
    if (!mol || !sel || !iter) continue
    iter.target = mol
    iter.sel = sel
    for (iter.first(); iter.hasMore(); iter.next()) {
      const p = iter.get().pos
      axes.forEach((a, i) => {
        const v = dot(p, a)
        if (v < lo[i]) lo[i] = v
        if (v > hi[i]) hi[i] = v
      })
    }
  }
  if (!Number.isFinite(lo[0])) return null
  for (let i = 0; i < 3; i++) {
    const grow = (hi[i] - lo[i]) * 0.2
    lo[i] -= grow
    hi[i] += grow
    if (hi[i] - lo[i] < MIN_EXTENT) {
      const c = (hi[i] + lo[i]) / 2
      lo[i] = c - MIN_EXTENT / 2
      hi[i] = c + MIN_EXTENT / 2
    }
  }
  const mid = [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2)
  // Back from the view's axes to the scene's.
  const center: [number, number, number] = [
    axes[0].x * mid[0] + axes[1].x * mid[1] + axes[2].x * mid[2],
    axes[0].y * mid[0] + axes[1].y * mid[1] + axes[2].y * mid[2],
    axes[0].z * mid[0] + axes[1].z * mid[1] + axes[2].z * mid[2],
  ]
  const mx = hi[0] - lo[0]
  const my = hi[1] - lo[1]
  const fasp = view.width / Math.max(1, view.height)
  const zoom = mx / my > fasp ? mx / fasp : my
  return { center, zoom, slab: hi[2] - lo[2] }
}

// --- The camera as ChimeraX states it (`turn`, `move`, `view matrix`, `zoom`) ---

/** A quaternion in CueMol's order: `a` the scalar part. */
export type Quat = [number, number, number, number]

/** The view's camera, read only. */
export interface CameraState {
  /** CueMol's view rotation: world axis = R(q) x screen axis. */
  rotation: Quat
  /** The screen's x, y and out-of-screen z axes, in the scene's coordinates. */
  right: Vec
  up: Vec
  back: Vec
  center: Vec
  distance: number
  /** The height of the view, in angstroms. */
  zoom: number
  width: number
  height: number
}

interface CameraView extends ViewAxes {
  rotation: { a: number; x: number; y: number; z: number }
  center: Vec
  distance: number
  zoom: number
}

/** The active view's camera, or null when there is no view. */
export function readCamera(ctx: WorkerContext, viewId: number): CameraState | null {
  const v = ctx.sceMgr.getView(viewId) as unknown as CameraView | null
  if (!v) return null
  const r = v.rotation
  const c = v.center
  return {
    rotation: [r.a, r.x, r.y, r.z],
    right: v.right_vec,
    up: v.up_vec,
    // CueMol's `forward_vec` is the screen's +z (`convZTrans`): toward the viewer.
    back: v.forward_vec,
    center: { x: c.x, y: c.y, z: c.z },
    distance: v.distance,
    zoom: v.zoom,
    width: v.width,
    height: v.height,
  }
}

/** Angstroms per pixel at the view centre. */
export function pixelSize(cam: CameraState): number {
  return cam.zoom / Math.max(1, cam.height)
}

/** Hamilton product. */
export function quatMul(p: Quat, q: Quat): Quat {
  const [a1, b1, c1, d1] = p
  const [a2, b2, c2, d2] = q
  return [
    a1 * a2 - b1 * b2 - c1 * c2 - d1 * d2,
    a1 * b2 + b1 * a2 + c1 * d2 - d1 * c2,
    a1 * c2 - b1 * d2 + c1 * a2 + d1 * b2,
    a1 * d2 + b1 * c2 - c1 * b2 + d1 * a2,
  ]
}

/** The rotation by `deg` degrees about the unit axis `u`. */
export function quatAxisAngle(u: [number, number, number], deg: number): Quat {
  const h = (deg * Math.PI) / 360
  const s = Math.sin(h)
  return [Math.cos(h), u[0] * s, u[1] * s, u[2] * s]
}

/**
 * The view rotation after the scene turns by `deg` about the screen axis
 * `u`, as ChimeraX's `turn` (the camera turns the other way): screen = R^T
 * world, and the scene's screen coordinates turning by T gives R' = R T^-1.
 */
export function turnedRotation(q: Quat, u: [number, number, number], deg: number): Quat {
  return quatMul(q, quatAxisAngle(u, -deg))
}

/** The quaternion of a rotation matrix given by its columns (Shepperd's method). */
export function quatFromColumns(x: Vec, y: Vec, z: Vec): Quat {
  const m = [
    [x.x, y.x, z.x],
    [x.y, y.y, z.y],
    [x.z, y.z, z.z],
  ]
  const tr = m[0][0] + m[1][1] + m[2][2]
  let q: Quat
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2
    q = [s / 4, (m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s]
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2
    q = [(m[2][1] - m[1][2]) / s, s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s]
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2
    q = [(m[0][2] - m[2][0]) / s, (m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s]
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2
    q = [(m[1][0] - m[0][1]) / s, (m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4]
  }
  const n = Math.hypot(...q)
  return q.map((v) => v / n) as Quat
}

/** ChimeraX's horizontal field of view, in degrees (`Camera.field_of_view`). */
export const CHIMERAX_FOV = 30

/**
 * The camera as ChimeraX's `view matrix camera` writes it: the 3x4 matrix
 * row by row, columns 0-2 the screen axes (the camera looks along -z) and
 * column 3 the eye position.
 */
export function cameraMatrix(cam: CameraState): number[] {
  const eye = {
    x: cam.center.x + cam.distance * cam.back.x,
    y: cam.center.y + cam.distance * cam.back.y,
    z: cam.center.z + cam.distance * cam.back.z,
  }
  const cols = [cam.right, cam.up, cam.back, eye]
  return (['x', 'y', 'z'] as const).flatMap((k) => cols.map((c) => c[k]))
}

/**
 * What `set_view` needs to place the camera at a ChimeraX matrix: the
 * rotation from its axes, the centre `distance` in front of the eye, and
 * the zoom that gives ChimeraX's 30-degree horizontal field of view there
 * (with perspective on; `GUIView` derives the perspective from the zoom
 * and the distance).
 */
export function cameraFromMatrix(m: readonly number[], distance: number, aspect: number): { rotation: Quat; center: [number, number, number]; zoom: number } {
  const col = (j: number): Vec => ({ x: m[j], y: m[4 + j], z: m[8 + j] })
  const [x, y, z, eye] = [col(0), col(1), col(2), col(3)]
  const len = (v: Vec) => Math.hypot(v.x, v.y, v.z) || 1
  const unit = (v: Vec): Vec => ({ x: v.x / len(v), y: v.y / len(v), z: v.z / len(v) })
  const back = unit(z)
  return {
    rotation: quatFromColumns(unit(x), unit(y), back),
    center: [eye.x - distance * back.x, eye.y - distance * back.y, eye.z - distance * back.z],
    zoom: (2 * distance * Math.tan(((CHIMERAX_FOV / 2) * Math.PI) / 180)) / aspect,
  }
}

/** A number as Python's `%.5g`. */
export function g5(v: number): string {
  if (v === 0) return '0'
  const s = v.toPrecision(5)
  if (s.includes('e')) {
    const [mant, exp] = s.split('e')
    const m = mant.includes('.') ? mant.replace(/\.?0+$/, '') : mant
    const e = Number(exp)
    return `${m}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`
  }
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}
