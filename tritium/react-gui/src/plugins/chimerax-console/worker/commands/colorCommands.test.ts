/**
 * @file plugins/chimerax-console/worker/commands/colorCommands.test.ts
 * @description When `color` clears a paint table before adding to it.
 *
 * A colour over the whole molecule hides every entry before it, so the
 * table is cleared first and does not grow each time the molecule is
 * coloured again (a long table made colouring and drawing slow). A colour
 * over part of the molecule, or one that leaves carbons alone, must keep
 * the entries under it.
 *
 * `color bfactor` takes one value range over every atom named, in every
 * model: a range per model would give one value two colours.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from '@plugins/console/worker/dialect-api'

const { state } = vi.hoisted(() => ({
  state: {
    ops: [] as { name: string; args: Record<string, unknown> }[],
    /** What the specification means in the molecule. */
    sel: '*',
    /** The B-factors of each molecule's atoms; two molecules when set. */
    bfac: null as Record<number, number[]> | null,
  },
}))

const OWNED = new Map([['chx:stick', 1], ['chx:ball', 2], ['chx:sphere', 3], ['chx:cartoon', 4], ['chx:nucl', 5]])

vi.mock('../display', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runOp: async (_ctx: unknown, _cc: unknown, name: string, args: Record<string, unknown>) => {
    state.ops.push({ name, args })
    return { ok: true }
  },
  ensureOwned: async () => ({ ok: true, ids: new Map(OWNED) }),
  ensurePaint: async () => ({ ok: true }),
  // Every renderer already has entries from an earlier colour.
  paintCount: () => 3,
  targetsOf: () => ({
    ok: true,
    targets: (state.bfac ? [10, 20] : [10]).map((uid) => ({ obj: { uid, model: uid, name: 'm', className: 'MolCoord' }, sel: state.sel })),
  }),
  forEachAtom: (_ctx: unknown, _s: number, uid: number, _expr: string, visit: (a: { bfac: number; occ: number }) => void) => {
    for (const b of state.bfac?.[uid] ?? []) visit({ bfac: b, occ: 1 })
  },
}))
vi.mock('../surface', () => ({ surfacesOn: () => [] }))

import { COLOR_COMMANDS } from './colorCommands'

const ctx = {} as WorkerContext
const cc = { sceneId: 1, viewId: 2, print: vi.fn(), warn: vi.fn() } as unknown as CmdContext

/** Run `color` and return the ops, as `name nodeId`. */
async function color(given: Record<string, string>): Promise<string[]> {
  const cmd = COLOR_COMMANDS.color
  const args = Object.fromEntries(cmd.args.map((a) => [a.name, given[a.name] ?? a.default ?? '']))
  const res = await cmd.run(ctx, args, cc)
  expect(res.ok).toBe(true)
  return state.ops.map((o) => `${o.name} ${o.args.nodeId}`)
}

beforeEach(() => {
  state.ops.length = 0
  state.sel = '*'
  state.bfac = null
})

describe('color', () => {
  it('clears each renderer before colouring the whole molecule, and keeps the entries otherwise', async () => {
    expect(await color({ objects: '#1', color: 'red', target: 'a' })).toEqual([
      'clear_paint 1', 'add_paint_at 1', 'clear_paint 2', 'add_paint_at 2', 'clear_paint 3', 'add_paint_at 3',
    ])
    state.ops.length = 0
    // Carbons keep their colour under byhetero.
    expect(await color({ objects: '#1', color: 'byhetero', target: 'a' })).not.toContain('clear_paint 1')
    state.ops.length = 0
    state.sel = 'chain A'
    expect(await color({ objects: '/A', color: 'red', target: 'a' })).toEqual(['add_paint_at 1', 'add_paint_at 2', 'add_paint_at 3'])
  })
})

describe('color bfactor', () => {
  it('spreads the palette over one range of every atom named, in every model', async () => {
    state.bfac = { 10: [10, 20], 20: [30, 40] }
    const cmd = COLOR_COMMANDS.colorBfactor
    const res = await cmd.run(ctx, Object.fromEntries(cmd.args.map((a) => [a.name, a.name === 'target' ? 'a' : ''])), cc)
    expect(res.ok).toBe(true)
    // The stick renderer of each model: the lowest value blue, the steps from 10 up to 40.
    const entries = (uid: number) => state.ops
      .filter((o) => o.name === 'add_paint_at' && o.args.nodeId === 1)
      .slice(uid === 10 ? 0 : 51, uid === 10 ? 51 : 102)
      .map((o) => [o.args.selection, o.args.color])
    for (const uid of [10, 20]) {
      expect(entries(uid)[0]).toEqual(['*', '#0000ff'])
      expect(entries(uid)[1][0]).toBe('bfac > 10')
      expect(entries(uid)[50]).toEqual(['bfac > 39.4', '#ff0505'])
    }
  })
})
