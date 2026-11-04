/**
 * @file plugins/chimerax-console/worker/commands/analysisCommands.test.ts
 * @description `distance` and `matchmaker`: which atoms and models they act on.
 *
 * Pinned: `distance` measures exactly two atoms -- ChimeraX reports a
 * summary for more, so measuring the first two of them would be a quiet
 * wrong answer -- and `matchmaker` moves every model given onto the
 * reference, never the reference itself.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from '@plugins/console/worker/dialect-api'

const { state } = vi.hoisted(() => ({
  state: {
    ops: [] as { name: string; args: Record<string, unknown> }[],
    /** The molecules a specification reaches, by spec text. */
    targets: {} as Record<string, number[]>,
    /** How many atoms each molecule's part has. */
    atoms: 2,
  },
}))

const obj = (uid: number) => ({ uid, model: uid, name: `m${uid}`, className: 'MolCoord' })

vi.mock('../display', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runOp: async (_ctx: unknown, _cc: unknown, name: string, args: Record<string, unknown>) => {
    state.ops.push({ name, args })
    return { ok: true, data: name === 'measure_geometry' ? { exactValue: 3.14159 } : undefined }
  },
  targetsOf: (_ctx: unknown, _s: number, spec: string) => ({ ok: true, targets: (state.targets[spec] ?? []).map((uid) => ({ obj: obj(uid), sel: '*' })) }),
  forEachAtom: (_ctx: unknown, _s: number, _uid: number, _expr: string, visit: (a: unknown) => boolean | void) => {
    for (let i = 0; i < state.atoms; i++) {
      const a = { id: i, name: 'CA', element: 'C', bfac: 0, occ: 1, chainName: 'A', residIndex: String(i + 1), residName: 'ALA', pos: { x: i, y: 0, z: 0 } }
      if (visit(a) === false) return
    }
  },
}))
vi.mock('../models', () => ({ numberedObjects: () => [obj(1), obj(2), obj(3)], isMolecule: () => true }))

import { ANALYSIS_COMMANDS } from './analysisCommands'

const ctx = {} as WorkerContext
const cc = { sceneId: 1, viewId: 2, print: vi.fn(), warn: vi.fn() } as unknown as CmdContext

beforeEach(() => {
  state.ops.length = 0
  state.targets = {}
  vi.mocked(cc.print).mockClear()
})

describe('distance', () => {
  it('measures exactly two atoms, to decimalPlaces', async () => {
    state.targets = { two: [1] }
    state.atoms = 2
    expect((await ANALYSIS_COMMANDS.distance.run(ctx, { objects: 'two', decimalPlaces: '2' }, cc)).ok).toBe(true)
    expect(vi.mocked(cc.print).mock.calls[0][0]).toMatch(/: 3\.14Å$/)

    state.atoms = 3
    expect((await ANALYSIS_COMMANDS.distance.run(ctx, { objects: 'two', decimalPlaces: '3' }, cc)).ok).toBe(false)
    expect(state.ops.filter((o) => o.name === 'measure_geometry')).toHaveLength(1)
  })
})

describe('matchmaker', () => {
  it('superposes each model given onto the reference, skipping the reference', async () => {
    state.targets = { all: [1, 2, 3], ref: [1] }
    expect((await ANALYSIS_COMMANDS.matchmaker.run(ctx, { atoms: 'all', to: 'ref' }, cc)).ok).toBe(true)
    expect(state.ops.filter((o) => o.name === 'superpose').map((o) => [o.args.movId, o.args.refId, o.args.algo])).toEqual([
      [2, 1, 'USalign'],
      [3, 1, 'USalign'],
    ])
  })
})
