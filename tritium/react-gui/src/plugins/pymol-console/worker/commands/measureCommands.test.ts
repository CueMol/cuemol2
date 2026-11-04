/**
 * @file plugins/pymol-console/worker/commands/measureCommands.test.ts
 * @description That a measurement means one label between centroids.
 *
 * The contract worth pinning is the deliberate divergence from PyMOL, which
 * loops over every combination of atoms and would draw fifty million labels
 * for four hundred-atom selections. Here each selection reaches C++ as one
 * expression and one label comes back, so the two things that must hold are
 * that the translated expressions are what gets passed and that the value
 * printed is the one C++ measured -- not a number recomputed on this side,
 * which could disagree with the label on screen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

/** A stub taking whatever the service takes. */
type Stub = ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>

const { services, ops } = vi.hoisted(() => {
  const stub = (impl?: (...args: unknown[]) => unknown) =>
    vi.fn<(...args: unknown[]) => unknown>(impl ?? (() => undefined))
  return {
    services: {
      listSceneObjects: stub(() => ({
        objects: [{ uid: 10, name: 'mol', className: 'MolCoord' }],
      })),
    } satisfies Record<string, Stub>,
    /** Every op run, and what measure_selections answers. */
    ops: {
      calls: [] as { name: string; args: Record<string, unknown> }[],
      answer: { ok: true, data: { value: 3.14 } } as { ok: boolean; data?: unknown; error?: string },
    },
  }
})

vi.mock('@renderer/worker/server/catalog', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findOp: (name: string) => ({ name }),
  invokeOp: async (op: { name: string }, _ctx: unknown, args: Record<string, unknown>) => {
    ops.calls.push({ name: op.name, args })
    return ops.answer
  },
}))

vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
  getSceneOrNull: () => ({ getObject: () => ({ name: 'mol' }) }),
}))
vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: (...a: unknown[]) => services.listSceneObjects(...a),
}))
vi.mock('@renderer/worker/server/services/helpers/atomintr', () => ({
  measureAtomCount: (mode: string) => (mode === 'distance' ? 2 : mode === 'angle' ? 3 : 4),
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
  streamId: (tag: string) => tag,
  noteStream: vi.fn(),
  stopped: () => false,
} as unknown as CmdContext

/** Run one command and give the outcome its real type. */
async function run(name: string, args: Record<string, string>): Promise<{ ok: boolean }> {
  const cmd = MEASURE_COMMANDS.find((c) => c.name === name)
  if (!cmd) throw new Error(`no ${name}`)
  return (await cmd.run(ctx, args, cc)) as { ok: boolean }
}

/** The measure_selections calls made. */
function measured(): Record<string, unknown>[] {
  return ops.calls.filter((o) => o.name === 'measure_selections').map((o) => o.args)
}

/** The selection expressions handed to measure_selections. */
function passedSelections(): string[] | undefined {
  return (measured()[0]?.selections as string | undefined)?.split('; ')
}

beforeEach(() => {
  vi.clearAllMocks()
  ops.calls.length = 0
  ops.answer = { ok: true, data: { value: 3.14 } }
  services.listSceneObjects.mockReturnValue({
    objects: [{ uid: 10, name: 'mol', className: 'MolCoord' }],
  })
})

describe('a measurement between selections', () => {
  it('draws one label per command, whatever the selections match', async () => {
    const out = await run('dihedral', {
      name: '',
      selection1: 'chain A',
      selection2: 'chain B',
      selection3: 'chain C',
      selection4: 'chain D',
      mode: '',
      cutoff: '',
    })
    expect(out).toEqual({ ok: true })
    // Not one per quadruple of atoms, which is what PyMOL would do.
    expect(measured()).toHaveLength(1)
    expect(passedSelections()).toEqual(['chain A', 'chain B', 'chain C', 'chain D'])
  })

  it('passes the translated expression, not what the user typed', async () => {
    await run('distance', {
      name: '',
      selection1: 'resi 1-10',
      selection2: 'name CA+CB',
      mode: '',
      cutoff: '',
    })
    expect(passedSelections()).toEqual(['resi 1:10', 'name CA,CB'])
  })

  it('prints the value C++ measured', async () => {
    await run('angle', {
      name: '',
      selection1: 'chain A',
      selection2: 'chain B',
      selection3: 'chain C',
      mode: '',
    })
    expect(cc.print).toHaveBeenCalledWith(' angle: 3.14 degrees')
  })

  it('reports a selection that matched nothing rather than printing a number', async () => {
    ops.answer = { ok: false, error: 'a selection did not compile or matched no atom' }
    const out = await run('distance', {
      name: '',
      selection1: 'chain A',
      selection2: 'chain Z',
      mode: '',
      cutoff: '',
    })
    expect(out.ok).toBe(false)
    expect(cc.print).not.toHaveBeenCalled()
  })
})
