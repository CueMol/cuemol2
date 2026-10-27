/**
 * @file worker/server/services/helpers/defPaintColoring.test.ts
 * @description The default painting: one palette colour per molecule, carried
 * by the scene.
 *
 * Two contracts. The n-th molecule (load order) is painted from `palette_n`,
 * cycling, with each structure a modifier of it -- the names are what the
 * scene file stores. And the palette is copied into the scene's own style set
 * from the global values, only where the scene has no definition yet: the
 * copy is what lets an older CueMol resolve the names, and overwriting would
 * undo the user's recolouring of the scene.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const { objects } = vi.hoisted(() => ({ objects: { list: [] as { uid: number; className: string }[] } }))

vi.mock('./makeSel', () => ({ makeSel: (_ctx: unknown, sel: string) => ({ sel }) }))
vi.mock('./makeColor', () => ({ makeColor: (_ctx: unknown, color: string) => ({ color }) }))
vi.mock('@renderer/worker/server/services/select/saveSelDef', () => ({ ensureWritableSceneSet: () => 7 }))
vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: () => ({ objects: objects.list }),
}))

import { createDefPaintColoring } from './defPaintColoring'

/** A context whose global palette_n is #0n0000 and whose scene defines `defined`. */
function makeCtx(defined: string[]) {
  const append = vi.fn()
  const setColor = vi.fn()
  const ctx = {
    svc: { createObj: () => ({ append }) },
    styleMgr: {
      getColorDefsJSON: () => JSON.stringify(defined),
      getColor: (name: string) => {
        const n = Number(name.replace('palette_', ''))
        return { r: () => n, g: () => 0, b: () => 0 }
      },
      setColor,
    },
  } as unknown as WorkerContext
  return { ctx, append, setColor }
}

/** The colour strings the painting was built with, by selection. */
function painted(append: ReturnType<typeof vi.fn>): Record<string, string> {
  return Object.fromEntries(
    append.mock.calls.map((c) => [(c[0] as { sel: string }).sel, (c[1] as { color: string }).color]),
  )
}

beforeEach(() => {
  // Eight molecules, listed out of load order, and a map that is not one.
  objects.list = [
    { uid: 30, className: 'MolCoord' }, { uid: 10, className: 'MolCoord' },
    { uid: 15, className: 'DensityMap' }, { uid: 20, className: 'MolCoord' },
    { uid: 40, className: 'MolCoord' }, { uid: 50, className: 'MolCoord' },
    { uid: 60, className: 'MolCoord' }, { uid: 70, className: 'MolCoord' },
    { uid: 80, className: 'MolCoord' },
  ]
})

describe('the default painting', () => {
  it('paints the n-th molecule from palette_n, cycling, by structure', () => {
    const { ctx, append } = makeCtx([])
    createDefPaintColoring(ctx, 1, 20)
    expect(painted(append)).toEqual({
      sheet: 'palette_2{mod_h:15;mod_s:-0.15}',
      helix: 'palette_2{mod_h:350}',
      nucleic: 'palette_2',
      '*': 'palette_2{mod_s:-0.6;mod_b:0.1}',
    })
    append.mockClear()
    // The eighth molecule wraps round to the first colour.
    createDefPaintColoring(ctx, 1, 80)
    expect(painted(append).nucleic).toBe('palette_1')
  })

  it("copies the global palette into the scene, keeping the scene's own colours", () => {
    const { ctx, setColor } = makeCtx(['palette_2', 'other'])
    createDefPaintColoring(ctx, 1, 10)
    const copied = setColor.mock.calls.map((c) => [c[0], (c[1] as { color: string }).color, c[2], c[3]])
    expect(copied).toEqual([1, 3, 4, 5, 6, 7].map((n) => [`palette_${n}`, `#0${n}0000`, 1, 7]))
  })
})
