/**
 * @file plugins/chimerax-console/worker/commands/viewCommands.test.ts
 * @description The camera ops ChimeraX's `turn`, `move` and `view matrix` run.
 *
 * What a wrong sign or a dropped term does not show as an error: the scene
 * turning or moving the other way from ChimeraX, a `frames` count that is
 * not applied (`turn y 3 30` must end at 90 degrees, not 3), and a
 * `view matrix` that places the camera but leaves CueMol's orthographic
 * projection, or puts the centre (and so the slab) away from the scene.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from '@plugins/console/worker/dialect-api'

const { ops } = vi.hoisted(() => ({ ops: [] as { name: string; args: Record<string, unknown> }[] }))

vi.mock('../display', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runOp: async (_ctx: unknown, _cc: unknown, name: string, args: Record<string, unknown>) => {
    ops.push({ name, args })
    return { ok: true }
  },
  targetsOf: () => ({ ok: true, targets: [] }),
}))
vi.mock('../camera', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // The scene's middle, on the line of sight 50 A in front of an eye at z = 60.
  framingOf: () => ({ center: [0, 0, 10], zoom: 30, slab: 30 }),
}))

import { VIEW_COMMANDS } from './viewCommands'
import { cameraMatrix, readCamera } from '../camera'
import type { Quat } from '../camera'

/** A view looking down -z with the identity rotation, centre at the origin. */
const view = {
  rotation: { a: 1, x: 0, y: 0, z: 0 },
  right_vec: { x: 1, y: 0, z: 0 },
  up_vec: { x: 0, y: 1, z: 0 },
  forward_vec: { x: 0, y: 0, z: 1 },
  center: { x: 0, y: 0, z: 0 },
  distance: 100,
  zoom: 40,
  width: 800,
  height: 400,
}
const ctx = { sceMgr: { getView: () => view } } as unknown as WorkerContext
const cc = { sceneId: 1, viewId: 2, print: vi.fn(), warn: vi.fn() } as unknown as CmdContext

/** The rotation matrix of a quaternion, by columns (CueMol: world axis = R(q) x screen axis). */
function columns(q: Quat): number[][] {
  const [a, b, c, d] = q
  return [
    [a * a + b * b - c * c - d * d, 2 * (b * c + a * d), 2 * (b * d - a * c)],
    [2 * (b * c - a * d), a * a - b * b + c * c - d * d, 2 * (c * d + a * b)],
    [2 * (b * d + a * c), 2 * (c * d - a * b), a * a - b * b - c * c + d * d],
  ]
}

const round = (v: number[]) => v.map((x) => Math.round(x * 1e6) / 1e6 + 0)

beforeEach(() => {
  ops.length = 0
})

describe('camera commands', () => {
  it('turn multiplies a finite frames count, and turns the way ChimeraX does', async () => {
    await VIEW_COMMANDS.turn.run(ctx, { axis: 'y', angle: '3', frames: '30' }, cc)
    const q = ops[0].args.rotation as Quat
    // 90 degrees about y, the near side going right: the screen's x now shows the scene's +z.
    expect(round(columns(q)[0])).toEqual([0, 0, 1])
  })

  it('move shifts the scene the given distance per frame along the screen axis', async () => {
    await VIEW_COMMANDS.move.run(ctx, { axis: 'x', distance: '1', frames: '10' }, cc)
    // The camera moves by -10 A, so the scene appears 10 A to the right.
    expect(ops[0].args.center).toEqual([-10, 0, 0])
  })

  it('view matrix places the camera with a perspective projection and the centre at the scene', async () => {
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 60]
    await VIEW_COMMANDS.viewMatrix.run(ctx, { camera: m.join(','), models: '', coordinateSystem: '' }, cc)
    expect(ops.map((o) => o.name)).toEqual(['set_view', 'set_view', 'set_projection'])
    const placed = ops[0].args as { rotation: Quat; center: number[]; distance: number; zoom: number }
    // The centre is where the line of sight passes the scene's middle (z = 10), 50 A from the eye.
    expect(placed.distance).toBe(50)
    expect(round(placed.center)).toEqual([0, 0, 10])
    // ChimeraX's 30-degree horizontal field of view at that distance, as a height.
    expect(placed.zoom).toBeCloseTo((2 * 50 * Math.tan(Math.PI / 12)) / 2, 6)
    expect(ops[1].args.fitSlab).toBe(true)
    expect(ops[2].args).toEqual({ perspective: true })
    // Read back, the camera is the matrix given.
    const back = { ...view, distance: placed.distance, center: { x: 0, y: 0, z: 10 } }
    const cam = readCamera({ sceMgr: { getView: () => back } } as unknown as WorkerContext, 2)
    expect(round(cameraMatrix(cam!))).toEqual(m)
  })
})
