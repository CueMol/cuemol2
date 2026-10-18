/**
 * @file plugins/console/worker/dialects/pymol/commands/viewMatrix.test.ts
 * @description PyMOL's view matrix and CueMol's camera describe the same view.
 *
 * `get_view` then `set_view` has to land where it started, and a PyMOL view
 * has to come out with the model the right way round -- a mistake in either
 * direction (transposed rotation, the centre offset folded the wrong way)
 * shows only on screen.
 */

import { describe, it, expect } from 'vitest'
import { camToPymol, pymolToCam, quatToMatrix } from './viewMatrix'
import type { CamState } from './viewMatrix'

function expectSameCam(a: CamState, b: CamState): void {
  const ma = quatToMatrix(a.quat)
  const mb = quatToMatrix(b.quat)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) expect(ma[r][c]).toBeCloseTo(mb[r][c], 6)
  a.center.forEach((v, i) => expect(v).toBeCloseTo(b.center[i], 6))
  expect(a.distance).toBeCloseTo(b.distance, 6)
  expect(a.slab).toBeCloseTo(b.slab, 6)
  expect(a.zoom).toBeCloseTo(b.zoom, 6)
  expect(a.perspective).toBe(b.perspective)
}

describe('the PyMOL view matrix', () => {
  it('round-trips a CueMol camera, perspective and orthographic', () => {
    // A rotation that is not symmetric, so a transposed matrix would show.
    const n = Math.hypot(0.9, 0.2, -0.3, 0.25)
    const cam: CamState = {
      quat: { a: 0.9 / n, x: 0.2 / n, y: -0.3 / n, z: 0.25 / n },
      center: [12.5, -3.25, 40],
      distance: 150,
      slab: 60,
      zoom: 45,
      perspective: true,
    }
    expectSameCam(pymolToCam(camToPymol(cam)), cam)
    expectSameCam(pymolToCam(camToPymol({ ...cam, perspective: false })), { ...cam, perspective: false })
  })

  it('reads a PyMOL view: identity rotation, off-axis origin folded into the centre', () => {
    const cam = pymolToCam([
      1, 0, 0, 0, 1, 0, 0, 0, 1,
      2, -1, -100,
      10, 20, 30,
      80, 120,
      -20,
    ])
    expect(cam.quat.a).toBeCloseTo(1, 6)
    // The origin 2 right and 1 down of the screen axis: the axis point is 2 left, 1 up of it.
    expect(cam.center).toEqual([8, 21, 30])
    expect(cam.distance).toBe(100)
    // Both planes kept: 20 in front of the centre, 20 behind.
    expect(cam.slab).toBe(40)
    expect(cam.perspective).toBe(true)
    expect(cam.zoom).toBeCloseTo(2 * 100 * Math.tan((10 * Math.PI) / 180), 6)
  })
})
