/**
 * @file plugins/pymconsole/worker/commands/measureCommands.test.ts
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

const { services } = vi.hoisted(() => {
  const stub = (impl?: (...args: unknown[]) => unknown) =>
    vi.fn<(...args: unknown[]) => unknown>(impl ?? (() => undefined))
  return {
    services: {
      appendMeasureLabelBySel: stub(() => ({ ok: true, value: 3.14159 })),
      listSceneObjects: stub(() => ({
        objects: [{ uid: 10, name: 'mol', className: 'MolCoord' }],
      })),
    } satisfies Record<string, Stub>,
  }
})

vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
  getSceneOrNull: () => ({ getObject: () => ({ name: 'mol' }) }),
}))
vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: (...a: unknown[]) => services.listSceneObjects(...a),
}))
vi.mock('@renderer/worker/server/services/helpers/atomintr', () => ({
  appendMeasureLabelBySel: (...a: unknown[]) => services.appendMeasureLabelBySel(...a),
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
} as unknown as CmdContext

/** Run one command synchronously and give the outcome its real type. */
function run(name: string, args: Record<string, string>): { ok: boolean } {
  const cmd = MEASURE_COMMANDS.find((c) => c.name === name)
  if (!cmd) throw new Error(`no ${name}`)
  return cmd.run(ctx, args, cc) as { ok: boolean }
}

/** The selection expressions handed to the label helper. */
function passedSelections(): string[] | undefined {
  return services.appendMeasureLabelBySel.mock.calls[0]?.[3] as string[] | undefined
}

beforeEach(() => {
  vi.clearAllMocks()
  services.appendMeasureLabelBySel.mockReturnValue({ ok: true, value: 3.14159 })
  services.listSceneObjects.mockReturnValue({
    objects: [{ uid: 10, name: 'mol', className: 'MolCoord' }],
  })
})

describe('a measurement between selections', () => {
  it('draws one label per command, whatever the selections match', () => {
    const out = run('dihedral', {
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
    expect(services.appendMeasureLabelBySel).toHaveBeenCalledTimes(1)
    expect(passedSelections()).toEqual(['chain A', 'chain B', 'chain C', 'chain D'])
  })

  it('passes the translated expression, not what the user typed', () => {
    run('distance', {
      name: '',
      selection1: 'resi 1-10',
      selection2: 'name CA+CB',
      mode: '',
      cutoff: '',
    })
    expect(passedSelections()).toEqual(['resi 1:10', 'name CA,CB'])
  })

  it('prints the value C++ measured', () => {
    run('angle', {
      name: '',
      selection1: 'chain A',
      selection2: 'chain B',
      selection3: 'chain C',
      mode: '',
    })
    expect(cc.print).toHaveBeenCalledWith(' angle: 3.14 degrees')
  })

  it('reports a selection that matched nothing rather than printing a number', () => {
    services.appendMeasureLabelBySel.mockReturnValue({
      ok: false,
      error: 'a selection did not compile or matched no atom',
    })
    const out = run('distance', {
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
