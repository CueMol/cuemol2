/**
 * @file plugins/pymol-console/worker/commands/fileCommands.test.ts
 * @description That `load`'s format argument overrides the sniff.
 *
 * The reason the argument exists is the file the sniff gets wrong: a
 * structure-factor CIF shares its extension with a coordinate CIF, and
 * loading one as the other yields a molecule with no atoms rather than an
 * error. So what has to hold is that a given format reaches the reader
 * lookup as an explicit name -- if it were merely passed alongside, the
 * lookup would sniff anyway and the argument would look like it worked.
 *
 * Also that a molecule load lands under the console's own names: the load
 * preset's members are named `pym:<type>` and renamed to the representation
 * they draw, or `hide sticks` / `set stick_radius` right after a `fetch`
 * would find nothing to act on. (Which renderer a load makes is decided by
 * `buildHeadlessFileOpenOptions`, pinned in its own test.)
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
      getCompatibleRendererNames: stub(() => ({ types: [], objType: '', readerName: 'mmcif' })),
      getSceneTree: stub(() => ({ ok: false })),
      listSceneObjects: stub(() => ({ objects: [] })),
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
    return { ok: true }
  },
}))

vi.mock('fs', () => ({ existsSync: () => true }))
vi.mock('@renderer/worker/server/services/file/getCompatibleRendererNames', () => ({
  getCompatibleRendererNames: (...a: unknown[]) => services.getCompatibleRendererNames(...a),
}))
vi.mock('@renderer/worker/server/services/file/headlessOpen', () => ({
  // Only the renderer half matters here; the real builder is exercised by
  // the dialog's own tests.
  buildHeadlessFileOpenOptions: (_ctx: unknown, a: { rendererType: string | null }) => ({
    format: {},
    renderer: a.rendererType === null
      ? { rendererType: 'simple', presetName: 'DefaultPymRendPreset', rendererName: 'defaultpym_1' }
      : { rendererType: a.rendererType, rendererName: `${a.rendererType}1` },
  }),
}))
vi.mock('@renderer/worker/server/services/file/streamLoadFromUrl', () => ({
  streamLoadFromUrl: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/sceneTree/sceneTree', () => ({
  getSceneTree: (...a: unknown[]) => services.getSceneTree(...a),
  setNodeVisible: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: (...a: unknown[]) => services.listSceneObjects(...a),
}))

import { FILE_COMMANDS, parseFetchCode } from './fileCommands'
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
  streamId: (tag: string) => tag,
  noteStream: vi.fn(),
  stopped: () => false,
} as unknown as CmdContext

/** The args of every op of this name that ran. */
function opArgs(name: string): Record<string, unknown>[] {
  return ops.filter((o) => o.name === name).map((o) => o.args)
}

/** Run `load` synchronously with the arguments that matter. */
async function load(over: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
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
  return (await cmd.run(ctx, args, cc)) as { ok: boolean; error?: string }
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
  ops.length = 0
  services.listSceneObjects.mockReturnValue({ objects: [] })
  services.getSceneTree.mockReturnValue({ ok: false })
})

describe('load with an explicit format', () => {
  it('sniffs when no format is given', async () => {
    await load({})
    expect(askedReader()).toBeUndefined()
  })

  it('passes a CueMol reader name straight through', async () => {
    // The case the argument exists for: same extension, different object.
    await load({ filename: '1crn-sf.cif', format: 'mmcifmap' })
    expect(askedReader()).toBe('mmcifmap')
  })

  it("translates PyMOL's own format names", async () => {
    await load({ filename: 'x.ccp4', format: 'ccp4' })
    expect(askedReader()).toBe('ccp4map')
  })

  it('refuses a format this build has no reader for, and lists what it has', async () => {
    const out = await load({ format: 'dx' })
    expect(out.ok).toBe(false)
    expect(out.error).toContain('mmcifmap')
    // Internal readers are not offered as formats.
    expect(out.error).not.toContain('qdfmol')
    expect(opArgs('load_file')).toEqual([])
  })
})

describe('the renderer a load creates', () => {
  it("puts the load preset's members under the console's names", async () => {
    services.listSceneObjects.mockReturnValue({ objects: [{ uid: 5, name: '1crn', className: 'MolCoord' }] })
    const member = (id: number, name: string) => ({ id, name, type: 'renderer', children: [] })
    services.getSceneTree.mockReturnValue({
      ok: true,
      tree: {
        id: 1, name: 'scene', type: 'scene',
        children: [{
          id: 5, name: '1crn', type: 'object',
          children: [{
            id: 10, name: 'pym:', type: 'rendGroup',
            children: [
              member(11, 'pym:ribbon'), member(12, 'pym:nucl'), member(13, 'pym:ballstick'),
              member(14, 'pym:cpk'), member(15, 'pym:simple'),
            ],
          }],
        }],
      },
    })
    await load({ filename: '1crn.pdb' })
    // The preset names its members prefix + type, so the prefix is the console's.
    // The reader the lookup found is passed on, so load_file does not sniff again.
    expect(opArgs('load_file')).toEqual([expect.objectContaining({ reader: 'mmcif', rendererName: 'pym:', rendererType: null })])
    const renamed = opArgs('rename_node').map((a) => [a.nodeId, a.name])
    // pym:nucl keeps its name: it is cartoon's companion, not a representation.
    expect(renamed).toEqual([[11, 'pym:cartoon'], [13, 'pym:sticks'], [14, 'pym:spheres'], [15, 'pym:lines']])
  })
})

describe('delete', () => {
  /** A scene with one map object carrying a named contour renderer. */
  function sceneWithMesh(): void {
    services.listSceneObjects.mockReturnValue({
      objects: [{ uid: 5, name: '2fofc', className: 'DensityMap' }],
    })
    services.getSceneTree.mockReturnValue({
      ok: true,
      tree: {
        id: 1,
        name: 'scene',
        type: 'scene',
        children: [
          {
            id: 5,
            name: '2fofc',
            type: 'object',
            children: [{ id: 20, name: 'msh', type: 'renderer', children: [] }],
          },
        ],
      },
    })
  }

  async function del(name: string): Promise<{ ok: boolean }> {
    const cmd = FILE_COMMANDS.find((c) => c.name === 'delete')
    if (!cmd) throw new Error('no delete')
    return (await cmd.run(ctx, { name }, cc)) as { ok: boolean }
  }

  it('removes a renderer that isomesh named', async () => {
    // PyMOL's isomesh makes an object, so `delete msh` works there; here it
    // made a renderer, and the name is the only handle the user was given.
    sceneWithMesh()
    expect(await del('msh')).toEqual({ ok: true })
    expect(opArgs('delete_node')).toEqual([{ nodeId: 20, nodeType: 'renderer' }])
  })

  it('prefers an object over a renderer of the same name', async () => {
    sceneWithMesh()
    await del('2fofc')
    expect(opArgs('delete_node')).toEqual([{ nodeId: 5, nodeType: 'object' }])
  })

  it('reports a name that matches neither', async () => {
    sceneWithMesh()
    expect((await del('nope')).ok).toBe(false)
    expect(opArgs('delete_node')).toEqual([])
  })
})

describe('fetch codes', () => {
  it('reads a chain after the PDB id, as PyMOL does', () => {
    expect(parseFetchCode('1ABC')).toEqual({ pdbId: '1abc', chain: '' })
    expect(parseFetchCode('4hhbA')).toEqual({ pdbId: '4hhb', chain: 'A' })
    expect(parseFetchCode('4hhb_B')).toEqual({ pdbId: '4hhb', chain: 'B' })
    expect(parseFetchCode('abcd')).toBeNull()
  })
})
