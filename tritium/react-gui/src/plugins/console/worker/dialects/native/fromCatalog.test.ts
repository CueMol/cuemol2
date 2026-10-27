/**
 * @file plugins/console/worker/dialects/native/fromCatalog.test.ts
 * @description What a command generated from an op hands the op.
 *
 * The native console has no hand-written scene commands, so this binding is
 * the whole contract between what is typed and what runs: an alias's fixed
 * argument stays fixed, a node named by name arrives as its uid with its kind
 * filled in, and a CueMol selection arrives exactly as typed.
 */

import { describe, it, expect, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from '../../runtime/types'

vi.mock('@renderer/worker/server/services/sceneTree/sceneTree', () => ({
  getSceneTree: () => ({
    ok: true,
    tree: {
      children: [
        { id: 10, name: '1crn', type: 'object', children: [{ id: 11, name: 'cartoon1', type: 'renderer', children: [] }] },
        { id: 20, name: '2abc', type: 'object', children: [] },
      ],
    },
  }),
}))
vi.mock('@renderer/worker/server/services/select/validateSelection', () => ({
  validateSelection: () => ({ ok: true }),
}))

import { defineOp } from '@renderer/worker/server/catalog/op'
import { atoms, boolean, enumOf, nodeId, objectId, optional, path as path_, selection } from '@renderer/worker/server/catalog/params'
import { formatCommand } from '@renderer/worker/server/catalog/cmlFormat'
import { catalogCommands } from './fromCatalog'
import { CONSOLE_COMMAND_OPS } from '@renderer/worker/server/catalog'
import { NATIVE_BUILTINS } from './builtins'

const run = vi.fn((_ctx: unknown, _args: unknown) => ({ ok: true as const }))
const op = defineOp({
  name: 'set_visible',
  description: 'Show or hide.',
  params: {
    nodeId: nodeId('node', 'nodeType'),
    nodeType: enumOf(['object', 'renderer', 'rendGroup'], 'kind'),
    visible: boolean('flag'),
    sel: optional(selection('selection')),
  },
  mutates: true,
  group: 'nodes',
  expose: { tool: false, console: true },
  aliases: [{ name: 'show', fixed: { visible: true } }],
  run,
})

const cc = {
  sceneId: 1,
  viewId: 2,
  cwd: '/',
  print: vi.fn(),
  printMarkdown: vi.fn(),
  warn: vi.fn(),
  markMutated: vi.fn(),
  setCwd: vi.fn(),
  noteStream: vi.fn(),
  streamId: (tag: string) => tag,
  runScript: vi.fn(),
  openScene: vi.fn(),
  stopped: () => false,
} as unknown as CmdContext

describe('a command generated from an op', () => {
  it('fixes the alias argument, resolves names and passes a selection through', async () => {
    const show = catalogCommands([op]).find((c) => c.command.name === 'show')!.command
    // A fixed argument is not a parameter; the kind a name fills in goes last
    // so the next positional argument does not land in it.
    expect(show.params.map((p) => p.name)).toEqual(['nodeId', 'sel', 'nodeType'])

    const res = await show.run({} as WorkerContext, { nodeId: '1crn/cartoon1', nodeType: '', sel: 'chain A and resid 1:5' }, cc)

    expect(res).toEqual({ ok: true })
    expect(run.mock.calls[0][1]).toEqual({
      nodeId: 11,
      nodeType: 'renderer',
      visible: true,
      sel: 'chain A and resid 1:5',
    })
  })

  it('reports a typed value of the wrong kind instead of running', async () => {
    run.mockClear()
    const cmd = catalogCommands([op]).find((c) => c.command.name === 'set_visible')!.command
    const res = await cmd.run({} as WorkerContext, { nodeId: '1crn', nodeType: '', visible: 'maybe', sel: '' }, cc)
    expect(res.ok).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })
})

describe('a name pattern', () => {
  const cmd = catalogCommands([op]).find((c) => c.command.name === 'set_visible')!.command
  const runWith = (bound: Record<string, string>) =>
    cmd.run({} as WorkerContext, { nodeType: '', visible: 'false', sel: '', ...bound }, cc)

  it('runs the op on every match and warns about one that fails without stopping', async () => {
    run.mockClear()
    vi.mocked(cc.warn).mockClear()
    run.mockImplementationOnce(() => ({ ok: false, error: 'locked' }) as never)

    expect(await runWith({ nodeId: '*' })).toEqual({ ok: true })
    // Each run gets one node, with its kind filled in as for a typed name.
    expect(run.mock.calls.map((c) => (c[1] as { nodeId: number; nodeType: string }))).toMatchObject([
      { nodeId: 10, nodeType: 'object' },
      { nodeId: 20, nodeType: 'object' },
    ])
    expect(cc.warn).toHaveBeenCalledWith('1crn: locked')
  })

  it('reads a list of names, each run on its own, and a lone name as before', async () => {
    run.mockClear()
    vi.mocked(cc.warn).mockClear()
    expect(await runWith({ nodeId: '2abc 1crn/cartoon1 nosuch' })).toEqual({ ok: true })
    expect(run.mock.calls.map((c) => (c[1] as { nodeId: number }).nodeId)).toEqual([20, 11])
    expect(vi.mocked(cc.warn).mock.calls[0][0]).toMatch(/^nosuch: /)
    // One name that names nothing is still an error, and an escaped star is no pattern.
    expect((await runWith({ nodeId: 'nosuch' })).ok).toBe(false)
    expect((await runWith({ nodeId: 'zz\\*' })).ok).toBe(false)
    // A recorded action is shown so that it reads back as one node, not a list or a pattern.
    const shown = formatCommand('set_visible', op.params, { nodeId: 10, visible: true }, { nodeId: 'my mol' })
    expect(shown).toContain('nodeId="my mol"')
    expect(formatCommand('set_visible', op.params, { nodeId: 41 }, { nodeId: '1crn/@*selection' })).toContain('nodeId=1crn/@*selection')
  })

  it('warns when nothing matches and refuses patterns in two arguments', async () => {
    run.mockClear()
    vi.mocked(cc.warn).mockClear()
    expect(await runWith({ nodeId: 'zz*' })).toEqual({ ok: true })
    expect(cc.warn).toHaveBeenCalledWith('no matches found: zz*')
    expect(run).not.toHaveBeenCalled()

    const pair = defineOp({
      name: 'superpose',
      description: 'Fit.',
      params: { movId: objectId('moving'), refId: objectId('reference') },
      mutates: true,
      group: 'nodes',
      expose: { tool: false, console: true },
      run,
    })
    const res = await catalogCommands([pair])[0].command.run({} as WorkerContext, { movId: '*', refId: '2*' }, cc)
    expect(res.ok).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })
})

describe('a result shown as a table', () => {
  it('prints Markdown, and one table for a run over several targets', async () => {
    const tableOp = (keyed: boolean) => defineOp({
      name: 'list_node_props',
      description: 'Props.',
      params: { nodeId: nodeId('node', 'nodeType'), nodeType: enumOf(['object', 'renderer', 'rendGroup'], 'kind') },
      mutates: false,
      group: 'nodes',
      expose: { tool: false, console: true },
      table: (d) => ({ title: 'T', head: ['Property', 'Value'], rows: [[`p_${(d as { id: number }).id}`, 'a|b']], keyed }),
      run: (_ctx, args) => ({ ok: true as const, data: { id: args.nodeId } }),
    })
    const md = vi.mocked(cc.printMarkdown)
    const runOn = (keyed: boolean, nodeId: string) =>
      catalogCommands([tableOp(keyed)])[0].command.run({} as WorkerContext, { nodeId, nodeType: '' }, cc)

    md.mockClear()
    await runOn(false, '1crn')
    // Emphasis marks and the cell separator are escaped, so the text shows as it is.
    expect(md.mock.calls[0][0]).toBe('**T**\n\n| Property | Value |\n|---|---|\n| p\\_10 | a\\|b |')

    md.mockClear()
    await runOn(false, '*')
    expect(md.mock.calls).toHaveLength(1)
    expect(md.mock.calls[0][0]).toContain('| Target | Property | Value |')
    expect(md.mock.calls[0][0]).toContain('| 2abc | p\\_20 |')

    md.mockClear()
    await runOn(true, '*')
    expect(md.mock.calls[0][0]).toBe('| Property | Value |\n|---|---|\n| p\\_10 | a\\|b |\n| p\\_20 | a\\|b |')
  })
})

describe('the file list of a load', () => {
  it('loads each file a pattern or list names, warns about what it cannot, and opens a scene only alone', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-load-'))
    fs.mkdirSync(path.join(dir, 'My Data'))
    for (const f of ['a.pdb', 'b.pdb', 's.qsc', 'My Data/c.pdb']) fs.writeFileSync(path.join(dir, f), '')
    const take = vi.fn((_ctx: unknown, args: { path: string }) => (args.path.endsWith('b.pdb') ? { ok: false as const, error: 'bad' } : { ok: true as const }))
    const loadOp = defineOp({
      name: 'load_file',
      description: 'Load.',
      params: { path: path_('file') },
      mutates: true,
      group: 'files',
      expose: { tool: false, console: true },
      outsideTxn: (a) => typeof a.path === 'string' && a.path.endsWith('.qsc'),
      run: take,
    })
    const cmd = catalogCommands([loadOp])[0].command
    const at = { ...cc, cwd: dir } as CmdContext
    vi.mocked(cc.warn).mockClear()

    expect(await cmd.run({} as WorkerContext, { path: '*.* zz* My\\ Data/c.pdb' }, at)).toEqual({ ok: true })
    expect(take.mock.calls.map((c) => path.relative(dir, c[1].path))).toEqual(['a.pdb', 'b.pdb', path.join('My Data', 'c.pdb')])
    expect(vi.mocked(cc.warn).mock.calls.map((c) => c[0])).toEqual([
      'no matches found: zz*',
      's.qsc: a scene file opens on its own; load it by its name alone',
      'b.pdb: bad',
    ])
    // Only a lone path can open a scene outside the undo transaction.
    expect(cmd.outsideTxn?.({ path: 's.qsc' })).toBe(true)
    expect(cmd.outsideTxn?.({ path: 'a.pdb s.qsc' })).toBe(false)
  })
})

describe('an atoms argument', () => {
  it('reads chain.residue.atom, the CueMol selection form, and writes the same text back', async () => {
    const take = vi.fn((_ctx: unknown, _args: unknown) => ({ ok: true as const }))
    const atomOp = defineOp({
      name: 'measure_geometry',
      description: 'Measure.',
      params: { atoms: atoms('atoms') },
      mutates: false,
      group: 'nodes',
      expose: { tool: false, console: true },
      run: take,
    })
    const cmd = catalogCommands([atomOp])[0].command

    expect(await cmd.run({} as WorkerContext, { atoms: 'A.20.CA B.12A.N' }, cc)).toEqual({ ok: true })
    const read = take.mock.calls[0][1] as { atoms: unknown }
    expect(read.atoms).toEqual([{ chain: 'A', resid: '20', atomName: 'CA' }, { chain: 'B', resid: '12A', atomName: 'N' }])
    expect(formatCommand('measure_geometry', atomOp.params, read)).toBe('measure_geometry atoms=A.20.CA B.12A.N')
  })
})

describe('the native command set', () => {
  it('names every command once', () => {
    // An alias that repeats an op name (or a builtin) would shadow it silently:
    // lookup takes the first match.
    const names = [
      ...catalogCommands(CONSOLE_COMMAND_OPS).map((c) => c.command.name),
      ...NATIVE_BUILTINS.map((c) => c.name),
    ]
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([])
  })

  it("completes a load's renderer types from the reader that will read the file", () => {
    // A format's load op reads with its own reader, so Tab must not sniff the
    // file (a CCP4 map once sniffed as NAMD coordinates); load_file does.
    const sourceOf = (name: string) => {
      const cmd = catalogCommands(CONSOLE_COMMAND_OPS).find((c) => c.command.name === name)!.command
      return cmd.completions?.[cmd.params.findIndex((p) => p.name === 'rendererType')]?.source
    }
    expect(sourceOf('load_ccp4')).toBe('fileRendererTypes:path:ccp4map')
    expect(sourceOf('load_file')).toBe('fileRendererTypes:path')
  })
})
