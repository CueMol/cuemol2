/**
 * @file plugins/pymol-console/worker/commands/viewCommands.test.ts
 * @description The camera ops PyMOL's view commands run.
 *
 * `set_view` must put back everything `get_view` printed: the rotation,
 * centre, distance, slab and zoom in one `set_view` (whose write order,
 * distance before slab, viewXformService.test.ts pins), and the projection
 * through `set_projection`.
 * `zoom` on a selection must frame it without changing the molecule's own
 * selection, which `focus_selection` does not touch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { ops } = vi.hoisted(() => ({ ops: [] as { name: string; args: Record<string, unknown> }[] }))

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  resolveObjects: () => [],
  moleculeSelections: () => ({ ok: true, items: [{ obj: { uid: 10, name: 'mol' }, selStr: 'resi 10:20' }], named: false }),
  runOp: async (_ctx: unknown, _cc: unknown, name: string, args: Record<string, unknown>) => {
    ops.push({ name, args })
    return { ok: true }
  },
}))
vi.mock('@renderer/worker/server/services/select/getSelHitCount', () => ({ getSelHitCount: () => ({ count: 30 }) }))

import { VIEW_COMMANDS } from './viewCommands'
import { camToPymol, pymolToCam } from './viewMatrix'
import type { CmdContext } from './types'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const cc = { sceneId: 1, viewId: 2, cwd: '/', print: vi.fn(), warn: vi.fn() } as unknown as CmdContext

function command(name: string) {
  const c = VIEW_COMMANDS.find((x) => x.name === name)
  if (!c) throw new Error(`no ${name}`)
  return c
}

beforeEach(() => {
  ops.length = 0
})

describe('view commands', () => {
  it('set_view restores the whole camera, projection included', async () => {
    const cam = {
      quat: { a: 1, x: 0, y: 0, z: 0 },
      center: [8.6, 10, 7.1] as [number, number, number],
      distance: 800,
      slab: 1000,
      zoom: 9.93,
      perspective: false,
    }
    const matrix = camToPymol(cam)
    const text = `(${matrix.join(', ')})`
    // What PyMOL's 18 numbers mean here; the command must write all of it.
    const want = pymolToCam(matrix)

    const res = await command('set_view').run({} as WorkerContext, { view: text, animate: '0', quiet: '1', hand: '1' }, cc)

    expect(res.ok).toBe(true)
    expect(ops.map((o) => o.name)).toEqual(['set_view', 'set_projection'])
    expect(ops[0].args).toEqual({
      rotation: [want.quat.a, want.quat.x, want.quat.y, want.quat.z],
      center: want.center,
      distance: want.distance,
      slab: want.slab,
      zoom: want.zoom,
      fitSlab: null,
      objId: null,
    })
    expect(ops[1].args).toEqual({ perspective: false })
  })

  it('zoom on a selection frames it without setting the selection', async () => {
    const res = await command('zoom').run(
      {} as WorkerContext,
      { selection: 'resi 10-20', buffer: '0.0', state: '0', complete: '0', animate: '0' },
      cc,
    )

    expect(res.ok).toBe(true)
    expect(ops).toEqual([{ name: 'focus_selection', args: { objId: 10, selection: 'resi 10:20', zoom: true } }])
  })
})
