/**
 * @file plugins/pymconsole/worker/commands/mapCommands.test.ts
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

const { services } = vi.hoisted(() => {
  const stub = (impl?: (...args: unknown[]) => unknown) =>
    vi.fn<(...args: unknown[]) => unknown>(impl ?? (() => undefined))
  return {
    services: {
      listSceneObjects: stub(),
      listMapRenderers: stub(() => ({ items: [] })),
      getNewRendererOptions: stub(() => ({ ok: true, rendererTypes: ['contour', 'isosurf'] })),
      createRendererOnObject: stub(() => ({ ok: true, newRendId: 99 })),
      setMapRendererProp: stub(() => ({ ok: true })),
      setGenericProp: stub(() => ({ ok: true, entries: [] })),
      applyMapCenterPolicy: stub(),
    } satisfies Record<string, Stub>,
  }
})

vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: (...a: unknown[]) => services.listSceneObjects(...a),
}))
vi.mock('@renderer/worker/server/services/map/renderers', () => ({
  listMapRenderers: (...a: unknown[]) => services.listMapRenderers(...a),
}))
vi.mock('@renderer/worker/server/services/map/state', () => ({
  getMapRendererState: () => ({ state: null }),
}))
vi.mock('@renderer/worker/server/services/map/props', () => ({
  setMapRendererProp: (...a: unknown[]) => services.setMapRendererProp(...a),
  redrawMapCenter: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/map/emDefaults', () => ({
  applyMapCenterPolicy: (...a: unknown[]) => services.applyMapCenterPolicy(...a),
}))
vi.mock('@renderer/worker/server/services/rend/getNewRendererOptions', () => ({
  getNewRendererOptions: (...a: unknown[]) => services.getNewRendererOptions(...a),
  getRendPresetTypes: vi.fn(),
  collectRendPresetTypes: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/rend/createRendererOnObject', () => ({
  createRendererOnObject: (...a: unknown[]) => services.createRendererOnObject(...a),
}))
vi.mock('@renderer/worker/server/services/props/write', () => ({
  setGenericProp: (...a: unknown[]) => services.setGenericProp(...a),
  setGenericProps: vi.fn(),
  resetGenericProps: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
  getSceneOrNull: () => ({ getObject: () => ({}), getRenderer: () => ({}) }),
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
} as unknown as CmdContext

/** Run `isomesh` synchronously with the arguments that matter. */
function isomesh(over: Record<string, string>): { ok: boolean } {
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
  return cmd.run(ctx, args, cc) as { ok: boolean }
}

/** The value written to one boundary property, if it was written. */
function written(propName: string): string | number | undefined {
  const call = services.setGenericProp.mock.calls.find(
    (c) => (c[1] as { propName?: string } | undefined)?.propName === propName,
  )
  return (call?.[1] as { value?: string | number } | undefined)?.value
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
  services.createRendererOnObject.mockReturnValue({ ok: true, newRendId: 99 })
  services.setGenericProp.mockReturnValue({ ok: true, entries: [] })
  services.setMapRendererProp.mockReturnValue({ ok: true })
})

describe('carving a contour against a selection', () => {
  it('writes the molecule, the translated selection and the radius', () => {
    sceneWith(['1crn'])
    expect(isomesh({ selection: 'resi 1-10', carve: '1.6' })).toEqual({ ok: true })
    expect(written('bndry_molname')).toBe('1crn')
    expect(written('bndry_sel')).toBe('resi 1:10')
    expect(written('bndry_rng')).toBe(1.6)
  })

  it('carves against the molecule the selection names', () => {
    // PyMOL would carve against both; CueMol's boundary names one, so the
    // one the user wrote has to win over the first in the scene.
    sceneWith(['1crn', '4ins'])
    isomesh({ selection: '4ins and resi 5', carve: '2.0' })
    expect(written('bndry_molname')).toBe('4ins')
    expect(cc.warn).not.toHaveBeenCalled()
  })

  it('falls back to the first molecule, and says so', () => {
    sceneWith(['1crn', '4ins'])
    isomesh({ selection: 'resi 5', carve: '2.0' })
    expect(written('bndry_molname')).toBe('1crn')
    expect(cc.warn).toHaveBeenCalledWith(expect.stringContaining('1crn'))
  })

  it('takes the buffer as the range when no carve is given', () => {
    // PyMOL sizes the box with buffer and carves with carve; one range does
    // both here, so buffer has to reach it rather than be dropped.
    sceneWith(['1crn'])
    isomesh({ selection: 'resi 5', buffer: '3.0' })
    expect(written('bndry_rng')).toBe(3.0)
  })

  it('prefers carve over buffer when both are given', () => {
    sceneWith(['1crn'])
    isomesh({ selection: 'resi 5', buffer: '3.0', carve: '1.6' })
    expect(written('bndry_rng')).toBe(1.6)
  })

  it('leaves the boundary alone without a selection', () => {
    sceneWith(['1crn'])
    isomesh({})
    expect(written('bndry_molname')).toBeUndefined()
    // A boxed region is the only one that needs a centre.
    expect(services.applyMapCenterPolicy).toHaveBeenCalled()
  })
})
