/**
 * @file plugins/pymol-console/worker/commands/mapCommands.test.ts
 * @description That carving reaches the renderer's mol boundary.
 *
 * `carve` is three separate property writes (`bndry_molname`, `bndry_sel`,
 * `bndry_rng`) and getting any one of them wrong fails quietly: the mesh
 * still draws, just over the wrong region. The molecule choice is the part
 * with real room to be wrong, because CueMol names one molecule where PyMOL
 * carves against every object its selection matches, so this pins which one
 * gets picked.
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
      listSceneObjects: stub(),
      listMapRenderers: stub(() => ({ items: [] })),
      getNewRendererOptions: stub(() => ({ ok: true, rendererTypes: ['contour', 'isosurf'] })),
    } satisfies Record<string, Stub>,
    /** Every op the commands ran: the scene writes. */
    ops: [] as { name: string; args: Record<string, unknown> }[],
  }
})

vi.mock('@renderer/worker/server/catalog', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findOp: (name: string) => ({ name }),
  invokeOp: async (op: { name: string }, _ctx: unknown, args: Record<string, unknown>) => {
    ops.push({ name: op.name, args })
    return { ok: true, data: op.name === 'create_renderer' ? { rendererId: 99 } : undefined }
  },
}))

vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: (...a: unknown[]) => services.listSceneObjects(...a),
}))
vi.mock('@renderer/worker/server/services/map/renderers', () => ({
  listMapRenderers: (...a: unknown[]) => services.listMapRenderers(...a),
}))
vi.mock('@renderer/worker/server/services/map/state', () => ({
  getMapRendererState: () => ({ state: null }),
}))
vi.mock('@renderer/worker/server/services/rend/getNewRendererOptions', () => ({
  getNewRendererOptions: (...a: unknown[]) => services.getNewRendererOptions(...a),
  getRendPresetTypes: vi.fn(),
  collectRendPresetTypes: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
  getSceneOrNull: () => ({ getObject: () => ({ map_type_resolved: 'xtal' }), getRenderer: () => ({}) }),
}))

import { MAP_COMMANDS } from './mapCommands'
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

/** Run `isomesh` with the arguments that matter. */
async function isomesh(over: Record<string, string>): Promise<{ ok: boolean }> {
  const cmd = MAP_COMMANDS.find((c) => c.name === 'isomesh')
  if (!cmd) throw new Error('no isomesh')
  const args = {
    name: 'msh',
    map: '2fofc',
    level: '1.0',
    selection: '',
    buffer: '0.0',
    state: '1',
    carve: '',
    source_state: '0',
    quiet: '1',
    ...over,
  }
  return (await cmd.run(ctx, args, cc)) as { ok: boolean }
}

/** The value written to one boundary property (`set_node_prop`, as text), if it was written. */
function written(propName: string): unknown {
  return ops.find((o) => o.name === 'set_node_prop' && o.args.prop === propName)?.args.value
}

/** A scene holding a map and the named molecules. */
function sceneWith(molNames: string[]): void {
  services.listSceneObjects.mockReturnValue({
    objects: [
      { uid: 5, name: '2fofc', className: 'DensityMap' },
      ...molNames.map((n, i) => ({ uid: 10 + i, name: n, className: 'MolCoord' })),
    ],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  services.listMapRenderers.mockReturnValue({ items: [] })
  services.getNewRendererOptions.mockReturnValue({
    ok: true,
    rendererTypes: ['contour', 'isosurf'],
  })
  ops.length = 0
})

describe('carving a contour against a selection', () => {
  it('writes the molecule, the translated selection and the radius', async () => {
    sceneWith(['1crn'])
    expect(await isomesh({ selection: 'resi 1-10', carve: '1.6' })).toEqual({ ok: true })
    expect(written('bndry_molname')).toBe('1crn')
    expect(written('bndry_sel')).toBe('resi 1:10')
    expect(written('bndry_rng')).toBe('1.6')
  })

  it('carves against the molecule the selection names', async () => {
    // PyMOL would carve against both; CueMol's boundary names one, so the
    // one the user wrote has to win over the first in the scene.
    sceneWith(['1crn', '4ins'])
    await isomesh({ selection: '4ins and resi 5', carve: '2.0' })
    expect(written('bndry_molname')).toBe('4ins')
    expect(cc.warn).not.toHaveBeenCalled()
  })

  it('falls back to the first molecule, and says so', async () => {
    sceneWith(['1crn', '4ins'])
    await isomesh({ selection: 'resi 5', carve: '2.0' })
    expect(written('bndry_molname')).toBe('1crn')
    expect(cc.warn).toHaveBeenCalledWith(expect.stringContaining('1crn'))
  })

  it('takes the buffer as the range when no carve is given', async () => {
    // PyMOL sizes the box with buffer and carves with carve; one range does
    // both here, so buffer has to reach it rather than be dropped.
    sceneWith(['1crn'])
    await isomesh({ selection: 'resi 5', buffer: '3.0' })
    expect(written('bndry_rng')).toBe('3')
  })

  it('prefers carve over buffer when both are given', async () => {
    sceneWith(['1crn'])
    await isomesh({ selection: 'resi 5', buffer: '3.0', carve: '1.6' })
    expect(written('bndry_rng')).toBe('1.6')
  })

  it('leaves the boundary alone without a selection', async () => {
    sceneWith(['1crn'])
    await isomesh({})
    expect(written('bndry_molname')).toBeUndefined()
    // A boxed region is the only one that needs a centre.
    expect(ops.map((o) => o.name)).toContain('recenter_map')
  })
})
