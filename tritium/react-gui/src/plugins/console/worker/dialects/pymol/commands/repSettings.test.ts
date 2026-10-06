/**
 * @file plugins/console/worker/dialects/pymol/commands/repSettings.test.ts
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
    setGenericProp: vi.fn<(...args: unknown[]) => unknown>(() => ({ ok: true })),
    resetGenericProps: vi.fn<(...args: unknown[]) => unknown>(() => ({ ok: true })),
    renderers: [] as { id: number; name: string }[],
  },
}))

vi.mock('@renderer/worker/server/services/props/read', () => ({
  getGenericProps: () => ({
    ok: true,
    entries: [
      { key: 'bondw', type: 'real', value: 0.2 },
      { key: 'sphr', type: 'real', value: 0.2 },
      { key: 'alpha', type: 'real', value: 1 },
    ],
  }),
}))
vi.mock('@renderer/worker/server/services/props/write', () => ({
  setGenericProp: (...a: unknown[]) => services.setGenericProp(...a),
  resetGenericProps: (...a: unknown[]) => services.resetGenericProps(...a),
}))
vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  molecules: () => [{ uid: 10, name: 'mol', className: 'MolCoord' }],
  renderersOf: () => services.renderers,
}))
vi.mock('./colorCommands', () => ({ parseRgb: () => null }))

import { REP_SETTINGS, applyRememberedSettings, setRepSetting, toPropValue, unsetRepSetting } from './repSettings'
import type { CmdContext } from './types'

const ctx = {} as WorkerContext

function ccFor(sceneId: number): CmdContext {
  return { sceneId, viewId: 2, print: vi.fn(), warn: vi.fn() } as unknown as CmdContext
}

/** The (renderer, property, value) triples written. */
function writes(): [number, string, unknown][] {
  return services.setGenericProp.mock.calls.map((c) => {
    const a = c[1] as { nodeId: number; propName: string; value: unknown }
    return [a.nodeId, a.propName, a.value]
  })
}

describe('per-representation settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    services.renderers = []
  })

  it('translates the value, and stick_radius sets the ball radius too', () => {
    expect(toPropValue(REP_SETTINGS.cartoon_transparency, '0.25')).toBe(0.75)
    expect(toPropValue(REP_SETTINGS.cartoon_transparency, '1.5')).toBeNull()
    // A negative label_size is angstroms in PyMOL, which CueMol has no unit for.
    expect(toPropValue(REP_SETTINGS.label_size, '-1')).toBeNull()

    services.renderers = [{ id: 20, name: 'pym:sticks' }, { id: 21, name: 'simple1' }]
    const out = setRepSetting(ctx, ccFor(1), 'stick_radius', REP_SETTINGS.stick_radius, '0.4', 'mol')
    expect(out).toEqual({ ok: true })
    expect(writes()).toEqual([
      [20, 'bondw', 0.4],
      [20, 'sphr', 0.4],
    ])
  })

  it('gives a global value to renderers made later, until unset', () => {
    const cc = ccFor(2)
    // Nothing shown yet, as in a script that sets before it shows.
    setRepSetting(ctx, cc, 'stick_transparency', REP_SETTINGS.stick_transparency, '0.5', '')
    // An object-scoped value is that object's, not a new default.
    setRepSetting(ctx, cc, 'stick_radius', REP_SETTINGS.stick_radius, '0.4', 'mol')

    applyRememberedSettings(ctx, 2, 'sticks', 30)
    applyRememberedSettings(ctx, 2, 'cartoon', 31)
    expect(writes()).toEqual([[30, 'alpha', 0.5]])

    services.setGenericProp.mockClear()
    unsetRepSetting(ctx, cc, 'stick_transparency', REP_SETTINGS.stick_transparency, '')
    applyRememberedSettings(ctx, 2, 'sticks', 32)
    expect(writes()).toEqual([])
  })
})
