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
import { atoms, boolean, enumOf, nodeId, objectId, optional, selection } from '@renderer/worker/server/catalog/params'
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

  it('warns when nothing matches and refuses patterns in two arguments', async () => {
    run.mockClear()
    vi.mocked(cc.warn).mockClear()
    expect(await runWith({ nodeId: 'zz*' })).toEqual({ ok: true })
    expect(cc.warn).toHaveBeenCalledWith('nodeId: "zz*" matches nothing')
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
})
