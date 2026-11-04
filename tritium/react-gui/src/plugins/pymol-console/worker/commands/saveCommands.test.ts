/**
 * @file plugins/pymol-console/worker/commands/saveCommands.test.ts
 * @description What a partial `save` asks `save_object` for.
 *
 * Two things the file on disk does not show: the selection has to reach the
 * writer, and the object must not be re-pointed at the new file (`link`),
 * which File > Save As does and a PyMOL save must not.
 */

import { describe, it, expect, vi } from 'vitest'
import * as path from 'path'

const { ops } = vi.hoisted(() => ({ ops: [] as { name: string; args: Record<string, unknown> }[] }))

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  resolveMolSelection: () => ({ ok: true, target: { obj: { uid: 5, name: 'mol' }, selStr: 'resi 1:20' } }),
  runOp: async (_ctx: unknown, _cc: unknown, name: string, args: Record<string, unknown>) => {
    ops.push({ name, args })
    return { ok: true }
  },
}))
vi.mock('@renderer/worker/server/services/select/getSelHitCount', () => ({ getSelHitCount: () => ({ count: 146 }) }))

import { SAVE_COMMANDS } from './saveCommands'
import type { CmdContext } from './types'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

describe('save', () => {
  it('writes part of a molecule through save_object, without re-pointing the object', async () => {
    const cc = { sceneId: 1, viewId: 2, cwd: '/tmp', print: vi.fn(), warn: vi.fn() } as unknown as CmdContext

    const save = SAVE_COMMANDS[0]
    const res = await save.run({} as WorkerContext, { filename: 'part.pdb', selection: 'mol and resi 1-20', state: '-1', format: '' }, cc)

    expect(res.ok).toBe(true)
    expect(ops).toEqual([
      {
        name: 'save_object',
        args: { objId: 5, fileName: path.resolve('/tmp/part.pdb'), selection: 'resi 1:20', format: 'pdb', link: false },
      },
    ])
  })
})
