/**
 * @file plugins/chimerax-console/worker/commands/selectCommands.test.ts
 * @description How `select` and `name` write the selection and a named one.
 *
 * What the scene does not show as an error: `select` leaving another
 * molecule's old selection in place (ChimeraX replaces the whole
 * selection), the combining forms starting from nothing rather than from
 * the current selection, `name` keeping one expression for a
 * specification that meant something different in each model, `select
 * zone` widening to residues before the distance test (`@CB` would then
 * keep only CB), and `select down` going back to a selection that was
 * changed some other way since `select up`.
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
    /** The specification tree `select zone` builds. */
    node: null as unknown,
    /** How many atoms an expression matches (1 when not listed). */
    counts: new Map<string, number>(),
    /** `set_mol_selection` changes `sel`, as the op does (off where a test reads the writes one by one). */
    live: false,
  },
}))

vi.mock('../display', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runOp: async (_ctx: unknown, _cc: unknown, name: string, args: Record<string, unknown>) => {
    state.ops.push({ name, args })
    if (state.live && name === 'set_mol_selection') state.sel.set(Number(args.objId), String(args.selection))
    return { ok: true, data: name === 'count_selection' ? { atomCount: 1 } : undefined }
  },
  targetsOf: () => ({
    ok: true,
    targets: [...state.targets].map(([uid, sel]) => ({ obj: { uid, model: uid, name: `m${uid}`, className: 'MolCoord' }, sel })),
  }),
  readSpec: (_ctx: unknown, _s: number, text: string) => ({ ok: true, node: { kind: 'selector', name: text, pos: 0 } }),
  targetsOfNode: (_ctx: unknown, _s: number, node: unknown) => {
    state.node = node
    return { ok: true, targets: [{ obj: { uid: 10, model: 10, name: 'm10', className: 'MolCoord' }, sel: 'S' }] }
  },
  emitContext: () => ({ anyHit: () => true, chainsHit: () => ['A'] }),
  forEachAtom: (_ctx: unknown, _s: number, _uid: number, expr: string, visit: () => void) => {
    for (let i = 0; i < (state.counts.get(expr) ?? 1); i++) visit()
  },
}))
vi.mock('../models', () => ({
  numberedObjects: () => [10, 20].map((uid) => ({ uid, model: uid, name: `m${uid}`, className: 'MolCoord' })),
  isMolecule: () => true,
}))
vi.mock('@renderer/worker/server/services/props/read', () => ({
  getGenericProps: (_ctx: unknown, a: { nodeId: number }) => ({ ok: true, entries: [{ key: 'sel', value: state.sel.get(a.nodeId) ?? '' }] }),
}))

import { resetPromotions, SELECT_COMMANDS } from './selectCommands'

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
  state.counts.clear()
  state.live = false
  resetPromotions()
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

describe('select zone', () => {
  it('measures atom by atom from the targets less the reference, then widens to residues', async () => {
    const zone = { near: 'ligand', range: '5', find: '@CB', extend: '', residues: 'true' }
    await SELECT_COMMANDS.selectZone.run(ctx, zone, cc)
    const near = { kind: 'selector', name: 'ligand', pos: 0 }
    expect(state.node).toEqual({
      kind: 'and',
      left: { kind: 'and', left: { kind: 'selector', name: '@CB', pos: 0 }, right: { kind: 'not', term: near } },
      right: { kind: 'zone', term: near, level: '@', op: '<', dist: 5, pos: 0 },
    })
    // byres last, around the whole result, so a CB in range brings its residue.
    expect(written()[10]).toBe('byres (S)')
    await SELECT_COMMANDS.selectZone.run(ctx, { ...zone, extend: 'true' }, cc)
    expect(state.node).toMatchObject({ kind: 'or', right: near })
  })
})

describe('select up / down', () => {
  it('widens one level and goes back, but not to a selection changed since', async () => {
    state.live = true
    state.sel.set(10, 'name CA')
    state.counts.set('byres (name CA)', 8)
    await SELECT_COMMANDS.selectUp.run(ctx, {}, cc)
    expect(written()).toEqual({ 10: 'byres (name CA)' })
    state.ops.length = 0
    await SELECT_COMMANDS.selectDown.run(ctx, {}, cc)
    expect(written()).toEqual({ 10: 'name CA' })

    await SELECT_COMMANDS.selectUp.run(ctx, {}, cc)
    state.sel.set(10, 'chain B')
    state.ops.length = 0
    await SELECT_COMMANDS.selectDown.run(ctx, {}, cc)
    expect(written()).toEqual({})
  })
})
