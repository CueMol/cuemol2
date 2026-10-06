/**
 * @file plugins/console/worker/dialects/pymol/commands/repCommands.test.ts
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

const { services } = vi.hoisted(() => {
  const stub = (impl?: (...args: unknown[]) => unknown) =>
    vi.fn<(...args: unknown[]) => unknown>(impl ?? (() => undefined))
  return {
    services: {
      getSceneTree: stub(),
      setGenericProp: stub(() => ({ ok: true, entries: [] })),
      getGenericProps: stub(),
      setNodeVisible: stub(() => ({ ok: true })),
      listSceneObjects: stub(),
      createRendererOnObject: stub(() => ({ ok: true, newRendId: 99 })),
      getNewRendererOptions: stub(() => ({ ok: true, rendererTypes: ['ballstick'] })),
      applyStyles: stub(),
    } satisfies Record<string, Stub>,
  }
})

vi.mock('@renderer/worker/server/services/sceneTree/sceneTree', () => ({
  getSceneTree: (...a: unknown[]) => services.getSceneTree(...a),
  setNodeVisible: (...a: unknown[]) => services.setNodeVisible(...a),
}))
vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
  getSceneOrNull: () => ({ getRenderer: () => ({ applyStyles: (...a: unknown[]) => services.applyStyles(...a) }) }),
}))
vi.mock('@renderer/worker/server/services/props/write', () => ({
  setGenericProp: (...a: unknown[]) => services.setGenericProp(...a),
  resetGenericProps: vi.fn(),
  setGenericProps: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/props/read', () => ({
  getGenericProps: (...a: unknown[]) => services.getGenericProps(...a),
  collectProps: vi.fn(),
  typeLabelOf: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: (...a: unknown[]) => services.listSceneObjects(...a),
}))
vi.mock('@renderer/worker/server/services/rend/createRendererOnObject', () => ({
  createRendererOnObject: (...a: unknown[]) => services.createRendererOnObject(...a),
}))
vi.mock('@renderer/worker/server/services/rend/getNewRendererOptions', () => ({
  getNewRendererOptions: (...a: unknown[]) => services.getNewRendererOptions(...a),
  getRendPresetTypes: vi.fn(),
  collectRendPresetTypes: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/select/applyMolSelString', () => ({
  applyMolSelString: vi.fn(() => ({ ok: true })),
  centerMolSelection: vi.fn(),
  zoomMolSelection: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/coloring/applyColoring', () => ({
  setRendererColoring: vi.fn(() => ({ ok: true })),
}))
vi.mock('@renderer/worker/server/services/coloring/panelList', () => ({
  getRendererPaintInfo: vi.fn(() => ({ canPaint: true })),
}))
vi.mock('@renderer/worker/server/services/coloring/paintCrud', () => ({
  paintRendererSelection: vi.fn(() => ({ ok: true })),
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

/** The selection written to a renderer, if one was. */
function writtenSelection(): string | undefined {
  const call = services.setGenericProp.mock.calls.find(
    (c) => (c[1] as { propName?: string } | undefined)?.propName === 'sel',
  )
  return (call?.[1] as { value?: string } | undefined)?.value
}

describe('show / hide on the console-owned renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    services.getGenericProps.mockReturnValue({
      ok: true,
      entries: [{ key: 'sel', value: 'chain A', type: 'object<MolSelection>' }],
    })
  })

  it('widens the selection rather than replacing it', () => {
    sceneWith([{ id: 20, name: 'pym:sticks' }])
    const out = command('show').run(ctx, { representation: 'sticks', selection: 'chain B' }, cc)
    expect(out).toEqual({ ok: true })
    expect(writtenSelection()).toBe('(chain A) or (chain B)')
  })

  it('narrows the selection rather than clearing it', () => {
    sceneWith([{ id: 20, name: 'pym:sticks' }])
    command('hide').run(ctx, { representation: 'sticks', selection: 'chain B' }, cc)
    expect(writtenSelection()).toBe('(chain A) and not (chain B)')
  })

  it('leaves a renderer the user made alone', () => {
    // Only a GUI-made renderer is present, so `show` must add its own rather
    // than take that one over.
    sceneWith([{ id: 30, name: 'ballstick1' }])
    command('show').run(ctx, { representation: 'sticks', selection: 'chain B' }, cc)
    expect(writtenSelection()).toBeUndefined()
    expect(services.createRendererOnObject).toHaveBeenCalled()
    const opts = services.createRendererOnObject.mock.calls[0]?.[1] as
      | { rendOpts: { rendererName: string } }
      | undefined
    expect(opts?.rendOpts.rendererName).toBe('pym:sticks')
    // PyMOL's sticks have no balls: CueMol's Stick style, not ball-and-stick.
    expect(services.applyStyles).toHaveBeenCalledWith('StickBallStick,DefaultCPKColoring')
  })

  it('widens the selection of a renderer a load made, which has none', () => {
    // The pym:lines a fetch makes draws everything with an empty selection;
    // `show lines` on it once built the invalid `() or (...)`.
    sceneWith([{ id: 20, name: 'pym:lines' }])
    services.getGenericProps.mockReturnValue({
      ok: true,
      entries: [{ key: 'sel', value: '', type: 'object<MolSelection>' }],
    })
    command('show').run(ctx, { representation: 'lines', selection: 'chain B' }, cc)
    expect(writtenSelection()).toBe('(*) or (chain B)')
  })

  it('hides the renderer when no selection narrows it, and empties it for the next show', () => {
    sceneWith([{ id: 20, name: 'pym:sticks' }])
    command('hide').run(ctx, { representation: 'sticks', selection: 'all' }, cc)
    // Emptied: a later `show sticks, sel` unions with it, and the atoms
    // hidden here must not come back with that.
    expect(writtenSelection()).toBe('none')
    expect(services.setNodeVisible).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ nodeId: 20, visible: false }),
    )
  })

  it('with no argument, hide empties and hides every console renderer', () => {
    sceneWith([{ id: 20, name: 'pym:sticks' }, { id: 21, name: 'pym:cartoon' }])
    // PyMOL's `hide` alone: everything, everywhere.
    command('hide').run(ctx, { representation: '', selection: '', state: '0' }, cc)
    const emptied = services.setGenericProp.mock.calls
      .map((c) => c[1] as { nodeId: number; propName: string; value: string })
      .filter((a) => a.propName === 'sel' && a.value === 'none')
      .map((a) => a.nodeId)
    expect(emptied.sort()).toEqual([20, 21])
    expect(services.setNodeVisible).toHaveBeenCalledWith(ctx, expect.objectContaining({ nodeId: 21, visible: false }))
  })
})

describe('an object name inside a selection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('picks that molecule and means all of it there (abbreviated rep name too)', () => {
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
    command('show').run(ctx, { representation: 'stick', selection: '1ubi and resi 5', state: '0' }, cc)
    expect(services.createRendererOnObject).toHaveBeenCalledOnce()
    const args = services.createRendererOnObject.mock.calls[0][1] as {
      objId: number
      rendOpts: { selection: string; rendererName: string }
    }
    expect(args.objId).toBe(11)
    expect(args.rendOpts.rendererName).toBe('pym:sticks')
    // The object name became `all` in its own molecule rather than an
    // undefined named-selection reference.
    expect(args.rendOpts.selection).toBe('(all) and (resi 5)')
  })
})
