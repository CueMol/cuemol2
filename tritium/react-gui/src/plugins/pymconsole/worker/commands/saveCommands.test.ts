/**
 * @file plugins/pymconsole/worker/commands/saveCommands.test.ts
 * @description What a partial `save` hands the writer.
 *
 * Two things the file on disk does not show: the selection has to reach the
 * writer as its `sel`, and the object must not be re-pointed at the new file
 * (`convToLink`), which File > Save As does and a partial save must not.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  resolveMolSelection: () => ({ ok: true, target: { obj: { uid: 5, name: 'mol' }, selStr: 'resi 1-20' } }),
}))
const SEL = { __sel: 'resi 1-20' }
vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({ makeSel: () => SEL }))
vi.mock('@renderer/worker/server/services/select/getSelHitCount', () => ({ getSelHitCount: () => ({ count: 146 }) }))
const OBJ = { __obj: 5 }
vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
  getSceneOrNull: () => ({ getObject: () => OBJ }),
}))

import { SAVE_COMMANDS } from './saveCommands'
import type { CmdContext } from './types'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

describe('save', () => {
  it('writes part of a molecule through the writer\'s sel, without re-pointing the object', async () => {
    const writer = {
      sel: null as unknown,
      convToLink: true,
      path: '',
      attached: null as unknown,
      setPath(p: string) { this.path = p },
      attach(o: unknown) { this.attached = o },
      write: vi.fn(),
      detach: vi.fn(),
    }
    const createHandler = vi.fn(() => writer)
    const ctx = { strMgr: { createHandler } } as unknown as WorkerContext
    const cc = { sceneId: 1, viewId: 2, cwd: '/tmp', print: vi.fn(), warn: vi.fn() } as unknown as CmdContext

    const save = SAVE_COMMANDS[0]
    const res = await save.run(ctx, { filename: 'part.pdb', selection: 'mol and resi 1-20', state: '-1', format: '' }, cc)

    expect(res.ok).toBe(true)
    expect(createHandler).toHaveBeenCalledWith('pdb', 1)
    expect(writer.sel).toBe(SEL)
    expect(writer.convToLink).toBe(false)
    expect(writer.attached).toBe(OBJ)
    expect(writer.path).toBe('/tmp/part.pdb')
    expect(writer.write).toHaveBeenCalledOnce()
  })
})
