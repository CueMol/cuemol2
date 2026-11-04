/**
 * @file plugins/chimerax-console/worker/commands/reprCommands.test.ts
 * @description What `surface`, `hide ... surfaces`, `transparency` and `label` write.
 *
 * The cases pin what the scene would get quietly wrong: one surface for the
 * whole molecule instead of one per chain (ChimeraX's surfaces are per
 * chain), a surface built from the atoms given instead of the chain's
 * polymer (the shape would change with the specification), a hide that
 * deletes the surface instead of narrowing what it shows, a transparency
 * that reaches the wrong renderers or a whole molecule when only part of it
 * was named, and a residue label on no atom or on every atom.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from '@plugins/console/worker/dialect-api'

const { state } = vi.hoisted(() => ({
  state: {
    ops: [] as { name: string; args: Record<string, unknown> }[],
    /** The console's renderers on the molecule (uid 10), by name. */
    owned: new Map<string, number>(),
    /** Each renderer's `showsel`. */
    showsel: new Map<number, string>(),
    /** What the specification means in the molecule. */
    sel: '*',
    /** The chains an expression reaches. */
    chains: ['A', 'B'],
    nextId: 100,
  },
}))

vi.mock('../display', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runOp: async (_ctx: unknown, _cc: unknown, name: string, args: Record<string, unknown>) => {
    state.ops.push({ name, args })
    if (name === 'create_renderer') state.owned.set(String(args.name), state.nextId++)
    if (name === 'set_node_prop' && args.prop === 'showsel') state.showsel.set(Number(args.nodeId), String(args.value))
    return { ok: true }
  },
  ownedOn: () => new Map(state.owned),
  ensureOwned: async () => ({ ok: true, ids: new Map(state.owned) }),
  emitContext: () => ({ chainsHit: () => state.chains, anyHit: () => true }),
  targetsOf: () => ({ ok: true, targets: [{ obj: { uid: 10, model: 1, name: 'm', className: 'MolCoord' }, sel: state.sel }] }),
}))
vi.mock('@renderer/worker/server/services/props/read', () => ({
  getGenericProps: (_ctx: unknown, a: { nodeId: number }) => ({ ok: true, entries: [{ key: 'showsel', value: state.showsel.get(a.nodeId) ?? '' }] }),
}))
vi.mock('@renderer/worker/server/services/helpers/simplifySel', () => ({ simplifySel: (_ctx: unknown, s: string) => s }))

import { REPR_COMMANDS, residueAnchors } from './reprCommands'
import { DISPLAY_COMMANDS } from './displayCommands'
import type { ChxCommand } from '../cli/command'

const ctx = {} as WorkerContext
const cc = { sceneId: 1, viewId: 2, print: vi.fn(), warn: vi.fn() } as unknown as CmdContext

/** A command's arguments as the binder hands them: every one present, '' when not given. */
function run(cmd: ChxCommand, given: Record<string, string>) {
  const args = Object.fromEntries(cmd.args.map((a) => [a.name, given[a.name] ?? a.default ?? '']))
  return cmd.run(ctx, args, cc)
}

/** The ops of one name, as their arguments. */
const opsNamed = (name: string) => state.ops.filter((o) => o.name === name).map((o) => o.args)

beforeEach(() => {
  state.ops.length = 0
  state.owned.clear()
  state.showsel.clear()
  state.sel = '*'
  state.chains = ['A', 'B']
})

describe('surface', () => {
  it('makes one surface per chain from its polymer, and shows only the patches named', async () => {
    state.sel = 'resi 1:10'
    await run(REPR_COMMANDS.surface, { atoms: ':1-10' })
    expect(opsNamed('create_renderer').map((a) => [a.rendererType, a.name, a.selection])).toEqual([
      ['dsurface', 'chx:surface:A', '(chain A) and (protein or nucleic)'],
      ['dsurface', 'chx:surface:B', '(chain B) and (protein or nucleic)'],
    ])
    expect([...state.showsel.values()]).toEqual(['(resi 1:10) and (chain A)', '(resi 1:10) and (chain B)'])
  })

  it('hides patches by narrowing what the surface shows, keeping the surface', async () => {
    await run(REPR_COMMANDS.surface, { atoms: '' })
    state.sel = 'resi 1:10'
    await run(DISPLAY_COMMANDS.hide, { objects: ':1-10', what: 'surfaces', target: '' })
    expect(opsNamed('delete_node')).toEqual([])
    expect([...state.showsel.values()]).toEqual(['(chain A) and not (resi 1:10)', '(chain B) and not (resi 1:10)'])
  })
})

describe('transparency', () => {
  it('sets alpha on the renderers the target names (surfaces by default), and refuses part of a model', async () => {
    for (const n of ['chx:stick', 'chx:ball', 'chx:sphere', 'chx:cartoon', 'chx:nucl', 'chx:surface:A']) state.owned.set(n, state.nextId++)
    const id = (n: string) => state.owned.get(n)
    await run(REPR_COMMANDS.transparency, { objects: '', percent: '40', what: '', target: '' })
    expect(opsNamed('set_node_prop').map((a) => [a.nodeId, a.value])).toEqual([[id('chx:surface:A'), '0.6']])

    state.ops.length = 0
    await run(REPR_COMMANDS.transparency, { objects: '', percent: '100', what: '', target: 'c' })
    expect(opsNamed('set_node_prop').map((a) => [a.nodeId, a.value])).toEqual([[id('chx:cartoon'), '0'], [id('chx:nucl'), '0']])

    state.sel = 'resn CYS'
    const out = await run(REPR_COMMANDS.transparency, { objects: ':CYS', percent: '50', what: '', target: '' })
    expect(out.ok).toBe(false)
  })
})

describe('label', () => {
  it('hangs a residue label on CA, else C4\', else the first atom', () => {
    const atom = (id: number, name: string, residIndex: string) => ({ id, name, chainName: 'A', residIndex })
    expect(residueAnchors([
      atom(1, 'N', '1'), atom(2, 'CA', '1'),
      atom(3, 'P', '2'), atom(4, "C4'", '2'),
      atom(5, 'ZN', '3'), atom(6, 'X', '3'),
    ])).toEqual([2, 4, 5])
  })
})
