/**
 * @file worker/server/services/helpers/defPaintColoring.test.ts
 * @description The default painting: one theme colour per molecule, carried
 * by the scene.
 *
 * Two contracts. The n-th molecule (load order) is painted from the n-th
 * colour of the theme the style names, cycling over that theme's own count,
 * with each structure a modifier of it -- the names are what the scene file
 * stores. And the colour used is copied into the scene's own style set from
 * its global value, only where the scene has no definition yet: the copy is
 * what lets an older CueMol resolve the name, and overwriting would undo the
 * user's recolouring of the scene.
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

/** Global themes: okabe_ito with two colours, tol_bright with three (#0n0000 for the n-th). */
const GLOBAL = ['okabe_ito_1', 'okabe_ito_2', 'tol_bright_3', 'tol_bright_1', 'tol_bright_2', 'Red']

/** A context whose style names `theme` and whose scene defines `sceneNames`. */
function makeCtx(theme: string, sceneNames: string[] = []) {
  const append = vi.fn()
  const setColor = vi.fn()
  const ctx = {
    svc: { createObj: () => ({ append }) },
    styleMgr: {
      getStrData: () => theme,
      getColorDefsJSON: (scope: number) => JSON.stringify(scope === 0 ? GLOBAL : sceneNames),
      getColor: (name: string) => {
        const n = Number(name.replace(/\D/g, ''))
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
  // Four molecules, listed out of load order, and a map that is not one.
  objects.list = [
    { uid: 30, className: 'MolCoord' }, { uid: 10, className: 'MolCoord' },
    { uid: 15, className: 'DensityMap' }, { uid: 20, className: 'MolCoord' },
    { uid: 40, className: 'MolCoord' },
  ]
})

describe('the default painting', () => {
  it("paints the n-th molecule from the theme's n-th colour, cycling over its count", () => {
    const bright = makeCtx('tol_bright')
    createDefPaintColoring(bright.ctx, 1, 20)
    expect(painted(bright.append)).toEqual({
      sheet: 'tol_bright_2',
      helix: 'tol_bright_2',
      nucleic: 'tol_bright_2{mod_h:15}',
      '*': 'tol_bright_2{mod_s:-0.6;mod_b:0.1}',
    })
    bright.append.mockClear()
    // The fourth molecule wraps round a three-colour theme.
    createDefPaintColoring(bright.ctx, 1, 40)
    expect(painted(bright.append).helix).toBe('tol_bright_1')

    // A theme with no colours falls back to okabe_ito (two here: the third wraps).
    const unknown = makeCtx('nosuch')
    createDefPaintColoring(unknown.ctx, 1, 30)
    expect(painted(unknown.append).helix).toBe('okabe_ito_1')
  })

  it("copies the colour used into the scene, keeping the scene's own", () => {
    const fresh = makeCtx('okabe_ito')
    createDefPaintColoring(fresh.ctx, 1, 20)
    expect(fresh.setColor.mock.calls.map((c) => [c[0], (c[1] as { color: string }).color, c[2], c[3]]))
      .toEqual([['okabe_ito_2', '#020000', 1, 7]])

    const recoloured = makeCtx('okabe_ito', ['okabe_ito_2'])
    createDefPaintColoring(recoloured.ctx, 1, 20)
    expect(recoloured.setColor).not.toHaveBeenCalled()
  })
})
