/**
 * @file plugins/pymol-console/worker/commands/repSettings.test.ts
 * @description PyMOL's per-representation settings on the console renderers.
 *
 * Two things fail quietly. The value has to be translated, not passed
 * through: transparency is alpha the other way round, and stick_radius has
 * to move the ball radius with the stick radius or the balls end up thinner
 * than the sticks. And a global value has to reach the renderers made after
 * it was set, because a PyMOL script sets first and shows afterwards.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const { services } = vi.hoisted(() => ({
  services: {
    /** The ops run (the writes), in order. */
    ops: [] as { name: string; args: Record<string, unknown> }[],
    renderers: [] as { id: number; name: string }[],
  },
}))

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  molecules: () => [{ uid: 10, name: 'mol', className: 'MolCoord' }],
  renderersOf: () => services.renderers,
  runOp: async (_ctx: unknown, _cc: unknown, name: string, args: Record<string, unknown>) => {
    services.ops.push({ name, args })
    return { ok: true }
  },
}))
vi.mock('./colorCommands', () => ({ parseRgb: () => null }))

import { REP_SETTINGS, applyRememberedSettings, setRepSetting, toPropValue, unsetRepSetting } from './repSettings'
import type { CmdContext } from './types'

const ctx = {} as WorkerContext

function ccFor(sceneId: number): CmdContext {
  return { sceneId, viewId: 2, print: vi.fn(), warn: vi.fn() } as unknown as CmdContext
}

/** The (renderer, property, value) triples written (`set_node_prop`, value as text). */
function writes(): [unknown, unknown, unknown][] {
  return services.ops.filter((o) => o.name === 'set_node_prop').map((o) => [o.args.nodeId, o.args.prop, o.args.value])
}

describe('per-representation settings', () => {
  beforeEach(() => {
    services.ops.length = 0
    services.renderers = []
  })

  it('translates the value, and stick_radius sets the ball radius too', async () => {
    expect(toPropValue(REP_SETTINGS.cartoon_transparency, '0.25')).toBe(0.75)
    expect(toPropValue(REP_SETTINGS.cartoon_transparency, '1.5')).toBeNull()
    // A negative label_size is angstroms in PyMOL, which CueMol has no unit for.
    expect(toPropValue(REP_SETTINGS.label_size, '-1')).toBeNull()

    services.renderers = [{ id: 20, name: 'pym:sticks' }, { id: 21, name: 'simple1' }]
    const out = await setRepSetting(ctx, ccFor(1), 'stick_radius', REP_SETTINGS.stick_radius, '0.4', 'mol')
    expect(out).toEqual({ ok: true })
    expect(writes()).toEqual([
      [20, 'bondw', '0.4'],
      [20, 'sphr', '0.4'],
    ])
  })

  it('gives a global value to renderers made later, until unset', async () => {
    const cc = ccFor(2)
    // Nothing shown yet, as in a script that sets before it shows.
    await setRepSetting(ctx, cc, 'stick_transparency', REP_SETTINGS.stick_transparency, '0.5', '')
    // An object-scoped value is that object's, not a new default.
    await setRepSetting(ctx, cc, 'stick_radius', REP_SETTINGS.stick_radius, '0.4', 'mol')
    services.ops.length = 0

    await applyRememberedSettings(ctx, cc, 'sticks', 30)
    await applyRememberedSettings(ctx, cc, 'cartoon', 31)
    expect(writes()).toEqual([[30, 'alpha', '0.5']])

    services.ops.length = 0
    await unsetRepSetting(ctx, cc, 'stick_transparency', REP_SETTINGS.stick_transparency, '')
    await applyRememberedSettings(ctx, cc, 'sticks', 32)
    expect(writes()).toEqual([])
  })
})
