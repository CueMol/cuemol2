/**
 * @file plugins/pymconsole/worker/commands/fileCommands.test.ts
 * @description That `load`'s format argument overrides the sniff.
 *
 * The reason the argument exists is the file the sniff gets wrong: a
 * structure-factor CIF shares its extension with a coordinate CIF, and
 * loading one as the other yields a molecule with no atoms rather than an
 * error. So what has to hold is that a given format reaches the reader
 * lookup as an explicit name -- if it were merely passed alongside, the
 * lookup would sniff anyway and the argument would look like it worked.
 *
 * The renderer choice is pinned here for the same reason. C++ attaches
 * whatever type it is asked for without checking compatibility, so a map that
 * was given a molecule renderer loaded without an error and drew nothing.
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
      getCompatibleRendererNames: stub(() => ({ types: [], objType: '', readerName: 'mmcif' })),
      loadObject: stub(() => ({ ok: true })),
    } satisfies Record<string, Stub>,
  }
})

vi.mock('fs', () => ({ existsSync: () => true }))
vi.mock('@renderer/worker/server/services/file/getCompatibleRendererNames', () => ({
  getCompatibleRendererNames: (...a: unknown[]) => services.getCompatibleRendererNames(...a),
}))
vi.mock('@renderer/worker/server/services/file/loadObject', () => ({
  loadObject: (...a: unknown[]) => services.loadObject(...a),
}))
vi.mock('@renderer/worker/server/services/file/headlessOpen', () => ({
  // Only the renderer half matters here; the real builder is exercised by
  // the dialog's own tests.
  buildHeadlessFileOpenOptions: (_ctx: unknown, a: { rendererType: string | null }) => ({
    format: {},
    renderer: { rendererType: a.rendererType ?? 'simple' },
  }),
}))
vi.mock('@renderer/worker/server/services/file/streamLoadFromUrl', () => ({
  streamLoadFromUrl: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/sceneTree/sceneOps', () => ({
  deleteNode: vi.fn(),
  renameNode: vi.fn(),
}))

import { FILE_COMMANDS } from './fileCommands'
import type { CmdContext } from './types'

/** A worker context whose registry holds the readers a real build has. */
const ctx = {
  strMgr: {
    getInfoJSON2: () =>
      JSON.stringify([
        { name: 'pdb', fext: '*.pdb; *.ent', category: 0 },
        { name: 'mmcif', fext: '*.cif', category: 0 },
        { name: 'mmcifmap', fext: '*.cif', category: 0 },
        { name: 'ccp4map', fext: '*.ccp4', category: 0 },
        // Internal, and never offered.
        { name: 'qdfmol', fext: '*.qdf', category: 0 },
        // A writer, not a reader.
        { name: 'pdbwriter', fext: '*.pdb', category: 1 },
      ]),
  },
} as unknown as WorkerContext

const cc = {
  sceneId: 1,
  viewId: 2,
  cwd: '/data',
  print: vi.fn(),
  warn: vi.fn(),
  markMutated: vi.fn(),
  setCwd: vi.fn(),
} as unknown as CmdContext

/** Run `load` synchronously with the arguments that matter. */
function load(over: Record<string, string>): { ok: boolean; error?: string } {
  const cmd = FILE_COMMANDS.find((c) => c.name === 'load')
  if (!cmd) throw new Error('no load')
  const args = {
    filename: 'x.cif',
    object: '',
    state: '0',
    format: '',
    finish: '1',
    discrete: '-1',
    multiplex: '',
    zoom: '-1',
    partial: '0',
    mimic: '1',
    ...over,
  }
  return cmd.run(ctx, args, cc) as { ok: boolean; error?: string }
}

/** The renderer type the load was told to create. */
function rendererType(): string | undefined {
  const call = services.loadObject.mock.calls[0]
  const opts = (call?.[1] as { options?: { renderer?: { rendererType?: string } } } | undefined)
  return opts?.options?.renderer?.rendererType
}

/** The reader name handed to the lookup, if one was. */
function askedReader(): string | undefined {
  const call = services.getCompatibleRendererNames.mock.calls[0]
  return (call?.[1] as { readerName?: string } | undefined)?.readerName
}

beforeEach(() => {
  vi.clearAllMocks()
  services.getCompatibleRendererNames.mockReturnValue({
    types: [],
    objType: '',
    readerName: 'mmcif',
  })
  services.loadObject.mockReturnValue({ ok: true })
})

describe('load with an explicit format', () => {
  it('sniffs when no format is given', () => {
    load({})
    expect(askedReader()).toBeUndefined()
  })

  it('passes a CueMol reader name straight through', () => {
    // The case the argument exists for: same extension, different object.
    load({ filename: '1crn-sf.cif', format: 'mmcifmap' })
    expect(askedReader()).toBe('mmcifmap')
  })

  it("translates PyMOL's own format names", () => {
    load({ filename: 'x.ccp4', format: 'ccp4' })
    expect(askedReader()).toBe('ccp4map')
  })

  it('refuses a format this build has no reader for, and lists what it has', () => {
    const out = load({ format: 'dx' })
    expect(out.ok).toBe(false)
    expect(out.error).toContain('mmcifmap')
    // Internal readers are not offered as formats.
    expect(out.error).not.toContain('qdfmol')
    expect(services.loadObject).not.toHaveBeenCalled()
  })
})

describe('the renderer a load creates', () => {
  it('draws a molecule as lines, the way PyMOL does', () => {
    services.getCompatibleRendererNames.mockReturnValue({
      types: ['anisou', 'ballstick', 'cartoon', 'simple', 'tube'],
      objType: 'MolCoord',
      readerName: 'pdb',
    })
    load({ filename: '1crn.pdb' })
    // Not types[0]: the C++ list is alphabetical, so that would be `anisou`,
    // which draws nothing without ANISOU records.
    expect(rendererType()).toBe('simple')
  })

  it('gives a map a map renderer', () => {
    // The bug this pins: `simple` is not in the list, and C++ would attach it
    // anyway, leaving the map invisible.
    services.getCompatibleRendererNames.mockReturnValue({
      types: ['contour', 'isosurf'],
      objType: 'DensityMap',
      readerName: 'mtzmap',
    })
    load({ filename: 'x.mtz' })
    expect(rendererType()).toBe('contour')
  })
})
