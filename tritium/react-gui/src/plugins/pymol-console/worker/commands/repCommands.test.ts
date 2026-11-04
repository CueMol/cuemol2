/**
 * @file plugins/pymol-console/worker/commands/repCommands.test.ts
 * @description The convention that lets PyMOL's per-atom representation
 * flags live on CueMol's renderers.
 *
 * Two things would break silently. `show` has to widen the renderer's
 * selection rather than replace it, and `hide` has to narrow it -- replace
 * either and the command still works, just on the wrong atoms. And both have
 * to leave renderers the user made through the GUI alone; rewriting one of
 * those is invisible until they notice their own work changed.
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
      getSceneTree: stub(),
      getGenericProps: stub(),
      listSceneObjects: stub(),
      getNewRendererOptions: stub(() => ({ ok: true, rendererTypes: ['ballstick'] })),
    } satisfies Record<string, Stub>,
    /** Every op the commands ran, in order: the scene writes. */
    ops: [] as { name: string; args: Record<string, unknown> }[],
  }
})

// Every write goes through an op; the reads stay services.
vi.mock('@renderer/worker/server/catalog', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findOp: (name: string) => ({ name }),
  invokeOp: async (op: { name: string }, _ctx: unknown, args: Record<string, unknown>) => {
    ops.push({ name: op.name, args })
    return { ok: true, data: op.name === 'create_renderer' ? { rendererId: 99 } : undefined }
  },
}))
vi.mock('@renderer/worker/server/services/sceneTree/sceneTree', () => ({
  getSceneTree: (...a: unknown[]) => services.getSceneTree(...a),
}))
vi.mock('@renderer/worker/server/services/props/read', () => ({
  getGenericProps: (...a: unknown[]) => services.getGenericProps(...a),
  collectProps: vi.fn(),
  typeLabelOf: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: (...a: unknown[]) => services.listSceneObjects(...a),
}))
vi.mock('@renderer/worker/server/services/rend/getNewRendererOptions', () => ({
  getNewRendererOptions: (...a: unknown[]) => services.getNewRendererOptions(...a),
  getRendPresetTypes: vi.fn(),
  collectRendPresetTypes: vi.fn(),
}))

import { REP_COMMANDS } from './repCommands'
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

function command(name: string) {
  const c = REP_COMMANDS.find((x) => x.name === name)
  if (!c) throw new Error(`no ${name}`)
  return c
}

/** One molecule carrying the renderers named. */
function sceneWith(renderers: { id: number; name: string }[]): void {
  services.listSceneObjects.mockReturnValue({
    objects: [{ uid: 10, name: 'mol', className: 'MolCoord' }],
  })
  services.getSceneTree.mockReturnValue({
    ok: true,
    tree: {
      id: 1,
      name: 'scene',
      type: 'scene',
      children: [
        {
          id: 10,
          name: 'mol',
          type: 'object',
          children: renderers.map((r) => ({ ...r, type: 'renderer', children: [] })),
        },
      ],
    },
  })
}

/** The args of every op of this name that ran. */
function opArgs(name: string): Record<string, unknown>[] {
  return ops.filter((o) => o.name === name).map((o) => o.args)
}

/** The selection written to a renderer, if one was. */
function writtenSelection(): string | undefined {
  return opArgs('set_renderer_selection')[0]?.selection as string | undefined
}

describe('show / hide on the console-owned renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ops.length = 0
    services.getGenericProps.mockReturnValue({
      ok: true,
      entries: [{ key: 'sel', value: 'chain A', type: 'object<MolSelection>' }],
    })
  })

  it('widens the selection rather than replacing it', async () => {
    sceneWith([{ id: 20, name: 'pym:sticks' }])
    const out = await command('show').run(ctx, { representation: 'sticks', selection: 'chain B' }, cc)
    expect(out).toEqual({ ok: true })
    expect(writtenSelection()).toBe('(chain A) or (chain B)')
  })

  it('narrows the selection rather than clearing it', async () => {
    sceneWith([{ id: 20, name: 'pym:sticks' }])
    await command('hide').run(ctx, { representation: 'sticks', selection: 'chain B' }, cc)
    expect(writtenSelection()).toBe('(chain A) and not (chain B)')
  })

  it('leaves a renderer the user made alone', async () => {
    // Only a GUI-made renderer is present, so `show` must add its own rather
    // than take that one over.
    sceneWith([{ id: 30, name: 'ballstick1' }])
    await command('show').run(ctx, { representation: 'sticks', selection: 'chain B' }, cc)
    expect(writtenSelection()).toBeUndefined()
    expect(opArgs('create_renderer')).toEqual([
      expect.objectContaining({ objId: 10, rendererType: 'ballstick', name: 'pym:sticks', centerView: false }),
    ])
    // PyMOL's sticks have no balls: CueMol's Stick style, not ball-and-stick.
    expect(opArgs('set_renderer_styles')).toEqual([{ rendId: 99, styles: 'StickBallStick,DefaultCPKColoring' }])
  })

  it('widens the selection of a renderer a load made, which has none', async () => {
    // The pym:lines a fetch makes draws everything with an empty selection;
    // `show lines` on it once built the invalid `() or (...)`.
    sceneWith([{ id: 20, name: 'pym:lines' }])
    services.getGenericProps.mockReturnValue({
      ok: true,
      entries: [{ key: 'sel', value: '', type: 'object<MolSelection>' }],
    })
    await command('show').run(ctx, { representation: 'lines', selection: 'chain B' }, cc)
    expect(writtenSelection()).toBe('(*) or (chain B)')
  })

  it('hides the renderer when no selection narrows it, and empties it for the next show', async () => {
    sceneWith([{ id: 20, name: 'pym:sticks' }])
    await command('hide').run(ctx, { representation: 'sticks', selection: 'all' }, cc)
    // Emptied: a later `show sticks, sel` unions with it, and the atoms
    // hidden here must not come back with that.
    expect(writtenSelection()).toBe('none')
    expect(opArgs('set_visible')).toContainEqual({ nodeId: 20, nodeType: 'renderer', visible: false })
  })

  it('with no argument, hide empties and hides every console renderer', async () => {
    sceneWith([{ id: 20, name: 'pym:sticks' }, { id: 21, name: 'pym:cartoon' }])
    // PyMOL's `hide` alone: everything, everywhere.
    await command('hide').run(ctx, { representation: '', selection: '', state: '0' }, cc)
    const emptied = opArgs('set_renderer_selection').filter((a) => a.selection === 'none').map((a) => a.rendId)
    expect(emptied).toEqual([20, 21])
    expect(opArgs('set_visible')).toContainEqual({ nodeId: 21, nodeType: 'renderer', visible: false })
  })

  it('takes pym:nucl along with cartoon, each kept to its own residues', async () => {
    // PyMOL's cartoon covers nucleic acids, which the load preset draws with
    // nucl. Unscoped, `show cartoon` widened nucl to the protein (drawn as
    // flat nucl tubes over the ribbon) and the ribbon to the nucleic acid.
    sceneWith([{ id: 21, name: 'pym:cartoon' }, { id: 22, name: 'pym:nucl' }, { id: 23, name: 'pym:sticks' }])
    await command('show').run(ctx, { representation: 'cartoon', selection: 'chain B', state: '0' }, cc)
    const written = Object.fromEntries(opArgs('set_renderer_selection').map((a) => [a.rendId, a.selection]))
    expect(written).toEqual({
      21: '(chain A) or ((chain B) and (not (nucleic)))',
      22: '(chain A) or ((chain B) and (nucleic))',
    })

    // `as cartoon` keeps the companion shown and steps the rest aside.
    ops.length = 0
    services.getGenericProps.mockReturnValue({ ok: true, entries: [{ key: 'sel', value: '*', type: 'object<MolSelection>' }] })
    await command('as').run(ctx, { representation: 'cartoon', selection: '' }, cc)
    const hidden = opArgs('set_visible').filter((a) => !a.visible).map((a) => a.nodeId)
    expect(hidden).toEqual([23])
  })
})

describe('an object name inside a selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ops.length = 0
  })

  it('picks that molecule and means all of it there (abbreviated rep name too)', async () => {
    services.listSceneObjects.mockReturnValue({
      objects: [
        { uid: 10, name: '1ubq', className: 'MolCoord' },
        { uid: 11, name: '1ubi', className: 'MolCoord' },
      ],
    })
    services.getSceneTree.mockReturnValue({
      ok: true,
      tree: {
        children: [
          { id: 10, name: '1ubq', type: 'object', children: [] },
          { id: 11, name: '1ubi', type: 'object', children: [] },
        ],
      },
    })
    // `stick` is PyMOL's unique prefix of sticks.
    await command('show').run(ctx, { representation: 'stick', selection: '1ubi and resi 5', state: '0' }, cc)
    // The object name became `all` in its own molecule rather than an
    // undefined named-selection reference.
    expect(opArgs('create_renderer')).toEqual([
      expect.objectContaining({ objId: 11, name: 'pym:sticks', selection: '(all) and (resi 5)' }),
    ])
  })
})
