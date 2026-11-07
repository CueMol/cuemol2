/**
 * @file plugins/chimerax-console/worker/commands/colorCommands.test.ts
 * @description When `color` clears a paint table before adding to it.
 *
 * A colour over the whole molecule hides every entry before it, so the
 * table is cleared first and does not grow each time the molecule is
 * coloured again (a long table made colouring and drawing slow). A colour
 * over part of the molecule, or one that leaves carbons alone, must keep
 * the entries under it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from '@plugins/console/worker/dialect-api'

const { state } = vi.hoisted(() => ({
  state: {
    ops: [] as { name: string; args: Record<string, unknown> }[],
    /** What the specification means in the molecule. */
    sel: '*',
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
  targetsOf: () => ({ ok: true, targets: [{ obj: { uid: 10, model: 1, name: 'm', className: 'MolCoord' }, sel: state.sel }] }),
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
