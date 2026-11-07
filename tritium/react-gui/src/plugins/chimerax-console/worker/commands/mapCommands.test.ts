/**
 * @file plugins/chimerax-console/worker/commands/mapCommands.test.ts
 * @description What `volume`, `volume zone` and `volume unzone` write on a map's renderers.
 *
 * What the scene does not show as an error: a level written as sigma
 * instead of the map's own value, transparency written as opacity, a step
 * written where CueMol ignores it (a contour over a box is always drawn at
 * step 1), and an `unzone` that empties the boundary selection -- which
 * means every atom of the molecule -- instead of the molecule name.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from '@plugins/console/worker/dialect-api'

const { state } = vi.hoisted(() => ({
  state: {
    ops: [] as { name: string; args: Record<string, unknown> }[],
    /** The map renderer's type and the region it draws now. */
    type: 'contour',
    region: 'box',
    /** The molecules `nearAtoms` reaches, by uid. */
    near: [10],
  },
}))

vi.mock('../display', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runOp: async (_ctx: unknown, _cc: unknown, name: string, args: Record<string, unknown>) => {
    state.ops.push({ name, args })
    return { ok: true, data: name === 'set_renderer_type' ? { rendererId: 51 } : undefined }
  },
  targetsOf: () => ({
    ok: true,
    targets: state.near.map((uid) => ({ obj: { uid, model: uid / 10, name: `m${uid}`, className: 'MolCoord' }, sel: 'resi 20' })),
  }),
}))
vi.mock('./fileCommands', () => ({
  objectsOf: () => ({ ok: true, objs: [{ uid: 20, model: 2, name: 'map', className: 'DensityMap' }] }),
}))
vi.mock('@renderer/worker/server/catalog/refs', () => ({
  objectNodes: () => [{ id: 20, children: [{ id: 50, type: 'renderer' }] }],
  rendererNodesOf: (obj: { children: unknown[] }) => obj.children,
}))
vi.mock('@renderer/worker/server/services/props/read', () => ({
  getGenericProps: () => ({
    ok: true,
    entries: [{ key: 'type_name', value: state.type }, { key: 'region_mode_resolved', value: state.region }],
  }),
}))
vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
  getSceneOrNull: () => ({ getObjectByName: (name: string) => ({ uid: Number(name.slice(1)) }) }),
}))

import { MAP_COMMANDS } from './mapCommands'

const ctx = {} as WorkerContext
const cc = { sceneId: 1, viewId: 2, print: vi.fn(), warn: vi.fn() } as unknown as CmdContext

/** Run a command with the given arguments, the rest at their defaults. */
async function run(name: keyof typeof MAP_COMMANDS, given: Record<string, string>) {
  const cmd = MAP_COMMANDS[name]
  return cmd.run(ctx, Object.fromEntries(cmd.args.map((a) => [a.name, given[a.name] ?? a.default ?? ''])), cc)
}

/** The writes, as `prop=value` (set_node_prop) or `op key=value`. */
const writes = () => state.ops.map((o) => (o.name === 'set_node_prop' ? `${o.args.prop}=${o.args.value}` : `${o.name} ${JSON.stringify(o.args)}`))

beforeEach(() => {
  state.ops.length = 0
  state.type = 'contour'
  state.region = 'box'
  state.near = [10]
})

describe('volume', () => {
  it('writes the level as the map value, transparency as opacity, and a step only where CueMol uses it', async () => {
    expect((await run('volume', { volumes: '#2', level: '0.5', transparency: '0.3' })).ok).toBe(true)
    expect(writes()).toEqual(['level=0.5', 'set_map_contour {"rendId":50,"level":null,"extent":null,"color":null,"alpha":0.7}'])

    // A contour over a box is drawn at step 1 whatever lod says: refused before anything is written.
    state.ops.length = 0
    expect((await run('volume', { volumes: '#2', step: '2' })).ok).toBe(false)
    expect((await run('volume', { volumes: '#2', step: '3' })).ok).toBe(false)
    expect(state.ops).toEqual([])
    // Over the whole map it thins.
    expect((await run('volume', { volumes: '#2', step: '2', region: 'all' })).ok).toBe(true)
    expect(writes()).toEqual(['region_mode=full', 'lod=step2'])
  })
})

describe('volume zone / unzone', () => {
  it('sets the boundary to one molecule, and unzone empties the molecule name', async () => {
    expect((await run('volumeZone', { volumes: '#2', nearAtoms: '#1:20', range: '3' })).ok).toBe(true)
    expect(writes()).toEqual(['bndry_molname=m10', 'bndry_sel=resi 20', 'bndry_rng=3'])

    state.ops.length = 0
    state.near = [10, 20]
    expect((await run('volumeZone', { volumes: '#2', nearAtoms: '#1,2', range: '3' })).ok).toBe(false)
    expect(state.ops).toEqual([])

    await run('volumeUnzone', { volumes: '#2' })
    expect(writes()).toEqual(['bndry_molname=', 'region_mode=full'])
  })
})
