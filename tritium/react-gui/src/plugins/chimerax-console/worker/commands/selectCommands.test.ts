/**
 * @file plugins/chimerax-console/worker/commands/selectCommands.test.ts
 * @description How `select` and `name` write the selection and a named one.
 *
 * What the scene does not show as an error: `select` leaving another
 * molecule's old selection in place (ChimeraX replaces the whole
 * selection), the combining forms starting from nothing rather than from
 * the current selection, and `name` keeping one expression for a
 * specification that meant something different in each model.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from '@plugins/console/worker/dialect-api'

const { state } = vi.hoisted(() => ({
  state: {
    ops: [] as { name: string; args: Record<string, unknown> }[],
    /** The current selection of each molecule, by uid. */
    sel: new Map<number, string>(),
    /** What the specification means in each molecule, by uid. */
    targets: new Map<number, string>(),
  },
}))

vi.mock('../display', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runOp: async (_ctx: unknown, _cc: unknown, name: string, args: Record<string, unknown>) => {
    state.ops.push({ name, args })
    return { ok: true, data: name === 'count_selection' ? { atomCount: 1 } : undefined }
  },
  targetsOf: () => ({
    ok: true,
    targets: [...state.targets].map(([uid, sel]) => ({ obj: { uid, model: uid, name: `m${uid}`, className: 'MolCoord' }, sel })),
  }),
}))
vi.mock('../models', () => ({
  numberedObjects: () => [10, 20].map((uid) => ({ uid, model: uid, name: `m${uid}`, className: 'MolCoord' })),
  isMolecule: () => true,
}))
vi.mock('@renderer/worker/server/services/props/read', () => ({
  getGenericProps: (_ctx: unknown, a: { nodeId: number }) => ({ ok: true, entries: [{ key: 'sel', value: state.sel.get(a.nodeId) ?? '' }] }),
}))

import { SELECT_COMMANDS } from './selectCommands'

const ctx = {} as WorkerContext
const cc = { sceneId: 1, viewId: 2, print: vi.fn(), warn: vi.fn() } as unknown as CmdContext

/** The selection written to each molecule (`set_mol_selection`), by uid. */
function written(): Record<number, unknown> {
  return Object.fromEntries(state.ops.filter((o) => o.name === 'set_mol_selection').map((o) => [o.args.objId, o.args.selection]))
}

beforeEach(() => {
  state.ops.length = 0
  state.sel.clear()
  state.targets.clear()
})

describe('select', () => {
  it('replaces the selection, clearing the molecules the specification does not reach', async () => {
    state.sel.set(20, 'chain B')
    state.targets.set(10, 'resn CYS')
    await SELECT_COMMANDS.select.run(ctx, { objects: ':CYS', residues: '' }, cc)
    expect(written()).toEqual({ 10: 'resn CYS', 20: '' })
  })

  it('adds to, takes from and intersects with the current selection', async () => {
    state.sel.set(10, 'chain A')
    state.targets.set(10, 'resn CYS')
    await SELECT_COMMANDS.selectAdd.run(ctx, { objects: ':CYS', residues: '' }, cc)
    await SELECT_COMMANDS.selectSubtract.run(ctx, { objects: ':CYS', residues: '' }, cc)
    await SELECT_COMMANDS.selectIntersect.run(ctx, { objects: ':CYS', residues: '' }, cc)
    expect(state.ops.filter((o) => o.name === 'set_mol_selection').map((o) => o.args.selection)).toEqual([
      '(chain A) or (resn CYS)',
      '(chain A) and not (resn CYS)',
      '(chain A) and (resn CYS)',
    ])
  })
})

describe('name', () => {
  it('refuses a specification that means something different in each model', async () => {
    state.targets.set(10, 'chain A')
    const out = await SELECT_COMMANDS.name.run(ctx, { name: 'site', text: '#1/A' }, cc)
    expect(out.ok).toBe(false)
    expect(state.ops.filter((o) => o.name === 'define_selection')).toEqual([])

    state.targets.set(20, 'chain A')
    expect((await SELECT_COMMANDS.name.run(ctx, { name: 'site', text: '/A' }, cc)).ok).toBe(true)
    expect(state.ops.filter((o) => o.name === 'define_selection').map((o) => o.args.selection)).toEqual(['chain A'])
  })
})
