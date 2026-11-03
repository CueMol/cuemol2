/**
 * @file plugins/console/worker/dialects/chimerax/camera.ts
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
