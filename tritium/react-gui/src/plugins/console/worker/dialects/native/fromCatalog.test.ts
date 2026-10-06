/**
 * @file plugins/console/worker/dialects/native/fromCatalog.test.ts
 * @description What a command generated from an op hands the op.
 *
 * The native console has no hand-written scene commands, so this binding is
 * the whole contract between what is typed and what runs: a verb's fixed
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
      ],
    },
  }),
}))
vi.mock('@renderer/worker/server/services/select/validateSelection', () => ({
  validateSelection: () => ({ ok: true }),
}))

import { defineOp } from '@renderer/worker/server/catalog/op'
import { boolean, enumOf, nodeId, optional, selection } from '@renderer/worker/server/catalog/params'
import { catalogCommands } from './fromCatalog'

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
  expose: { tool: false, console: true },
  verbs: [{ verb: 'show', fixed: { visible: true } }],
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
} as unknown as CmdContext

describe('a command generated from an op', () => {
  it('fixes the verb argument, resolves names and passes a selection through', async () => {
    const show = catalogCommands([op]).find((c) => c.command.name === 'show')!.command
    // A fixed argument is not a parameter, so it cannot be typed.
    expect(show.params.map((p) => p.name)).toEqual(['nodeId', 'nodeType', 'sel'])

    const res = await show.run({} as WorkerContext, { nodeId: '1crn.cartoon1', nodeType: '', sel: 'chain A and resid 1:5' }, cc)

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
