/**
 * @file plugins/pymconsole/worker/commands/measureCommands.test.ts
 * @description That a measurement is only taken between atoms it is sure of.
 *
 * PyMOL measures between whatever the selections match; this draws a label
 * between two named atoms. The gap between those is the whole risk: a
 * selection matching a hundred atoms silently measured to the first of them
 * would give a number that looks right and is not. So the contract worth
 * pinning is that an expression which cannot name one atom is refused, and a
 * well-formed one reaches `getAtom` with the chain, residue and name the
 * user wrote, whatever order they wrote them in.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

/** A stub taking whatever the service takes. */
type Stub = ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>

const { services } = vi.hoisted(() => {
  const stub = (impl?: (...args: unknown[]) => unknown) =>
    vi.fn<(...args: unknown[]) => unknown>(impl ?? (() => undefined))
  return {
    services: {
      getAtom: stub(),
      appendMeasureLabel: stub(),
      listSceneObjects: stub(() => ({
        objects: [{ uid: 10, name: 'mol', className: 'MolCoord' }],
      })),
    } satisfies Record<string, Stub>,
  }
})

vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
  getSceneOrNull: () => ({
    getObject: () => ({ getAtom: (...a: unknown[]) => services.getAtom(...a) }),
  }),
}))
vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: (...a: unknown[]) => services.listSceneObjects(...a),
}))
vi.mock('@renderer/worker/server/services/helpers/atomintr', () => ({
  appendMeasureLabel: (...a: unknown[]) => services.appendMeasureLabel(...a),
  measureAtomCount: (mode: string) => (mode === 'distance' ? 2 : mode === 'angle' ? 3 : 4),
  hasDegenerateAtoms: () => false,
}))

import { MEASURE_COMMANDS } from './measureCommands'
import type { CmdContext } from './types'

const ctx = {} as WorkerContext
const cc = {
  sceneId: 1,
  viewId: 2,
  cwd: '/',
  print: vi.fn(),
  warn: vi.fn(),
  markMutated: vi.fn(),
  setCwd: vi.fn(),
} as unknown as CmdContext

const distance = MEASURE_COMMANDS.find((c) => c.name === 'distance')!

/** Run `distance`, which is synchronous, and give the outcome its real type. */
function run(args: Record<string, string>): { ok: boolean } {
  return distance.run(ctx, args, cc) as { ok: boolean }
}

/** An atom three angstroms along x from the origin, for a round answer. */
function atomAt(x: number) {
  return {
    id: x,
    pos: {
      sub: (o: { x: number }) => ({ length: () => Math.abs(x - o.x) }),
      x,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  services.listSceneObjects.mockReturnValue({
    objects: [{ uid: 10, name: 'mol', className: 'MolCoord' }],
  })
})

describe('a measurement between named atoms', () => {
  it('measures between the atoms the selections name, in any argument order', () => {
    services.getAtom.mockImplementation((_c, r) => atomAt(r === '10' ? 0 : 3))
    const out = run({
      name: '',
      selection1: 'chain A and resi 10 and name CA',
      selection2: 'name CA and resi 20 and chain A',
    })
    expect(out).toEqual({ ok: true })
    expect(services.getAtom).toHaveBeenNthCalledWith(1, 'A', '10', 'CA')
    expect(services.getAtom).toHaveBeenNthCalledWith(2, 'A', '20', 'CA')
    expect(services.appendMeasureLabel).toHaveBeenCalled()
    expect(cc.print).toHaveBeenCalledWith(' distance: 3.00 angstroms')
  })

  it('refuses an expression that can match more than one atom', () => {
    services.getAtom.mockReturnValue(atomAt(0))
    for (const expr of ['chain A', 'chain A and resi 1-10 and name CA', 'polymer']) {
      const out = run({
        name: '',
        selection1: expr,
        selection2: 'chain A and resi 20 and name CA',
      })
      expect(out.ok).toBe(false)
      expect(services.appendMeasureLabel).not.toHaveBeenCalled()
    }
  })

  it('draws nothing when a later selection names no atom', () => {
    // The first atom resolves and the second does not; a half-drawn label
    // would be left behind by a loop that drew as it went.
    services.getAtom.mockImplementation((_c, r) => (r === '10' ? atomAt(0) : null))
    const out = run({
      name: '',
      selection1: 'chain A and resi 10 and name CA',
      selection2: 'chain A and resi 99 and name CA',
    })
    expect(out.ok).toBe(false)
    expect(services.appendMeasureLabel).not.toHaveBeenCalled()
  })
})
