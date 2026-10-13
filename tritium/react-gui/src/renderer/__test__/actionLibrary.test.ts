/**
 * @file renderer/__test__/actionLibrary.test.ts
 * @description Macros of the Action library: History steps made into a macro
 * that runs on another object, and a macro run on several selected objects
 * as one undo step, skipping the objects it fails on.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fakeObject, fakeScene, makeWorkerCtx } from '@renderer/worker/testing'
import type { ActionRow } from '@renderer/worker/server/actions/actionLog'
import { resetActionLog } from '@renderer/worker/server/actions/actionLog'
import { stepsToMacro } from '@renderer/worker/server/actions/macro'
import { parseQax, writeQax } from '@renderer/worker/server/actions/qax/codec'
import type { QaxMacro } from '@renderer/worker/server/actions/qax/model'
import { bindMacroItems, macroShape } from '@renderer/worker/server/actions/qax/run'
import { runLibraryEntry } from '@renderer/worker/server/services/actions/library'

/** One undo step of the given ops, each with the paths its node arguments had. */
function row(id: number, ops: [string, Record<string, unknown>, Record<string, string>][]): ActionRow {
  return {
    id,
    label: `step ${id}`,
    source: 'gui',
    time: null,
    undone: false,
    entries: ops.map(([op, args, refs]) => ({ kind: 'op' as const, op, args, refs })),
  } as ActionRow
}

const CREATE = row(1, [['create_renderer', { objId: 5, rendererType: 'cartoon', name: 'p' }, { objId: '1crn' }]])
const HIDE = (p: string) => row(2, [['set_visible', { nodeId: 9, nodeType: 'renderer', visible: false }, { nodeId: p }]])
const opts = { name: 'm', classOf: () => 'MolCoord' }

describe('Action library macros', () => {
  beforeEach(() => resetActionLog())

  it('makes steps on one object a macro that, saved and read back, runs on another object', () => {
    const made = stepsToMacro([CREATE, HIDE('1crn/p')], opts)
    if (!made.ok) throw new Error(made.error)
    const back = parseQax(writeQax({ version: 1, actions: [], macros: [made.macro] }))
    if ('error' in back) throw new Error(back.error)
    const macro = back.macros?.[0] as QaxMacro
    expect(macroShape(macro)).toEqual({ kind: 'target', targetType: 'MolCoord' })

    const items = bindMacroItems(macro, { target: '2abc' })
    if ('error' in items) throw new Error(items.error)
    const paths = items.flatMap((i) => (i.kind === 'op' ? i.args.filter((a) => a.path).map((a) => a.path) : []))
    expect(paths).toEqual(['2abc', '2abc/p'])
  })

  it('refuses steps on two objects, or on a renderer the steps do not create', () => {
    const other = row(3, [['set_visible', { nodeId: 6, nodeType: 'object', visible: false }, { nodeId: '2abc' }]])
    expect(stepsToMacro([CREATE, other], opts)).toEqual({ ok: false, error: expect.stringContaining('two objects') })
    expect(stepsToMacro([HIDE('1crn/cartoon1')], opts)).toEqual({ ok: false, error: expect.stringContaining('do not create') })
  })

  it('runs on each selected object in one undo step, skipping the ones it fails on', async () => {
    const a = fakeObject({ name: 'a' })
    const map = fakeObject({ name: 'map', className: 'DensityMap' })
    const b = fakeObject({ name: 'b' })
    const scene = fakeScene({ objects: [a, map, b] })
    const { ctx } = makeWorkerCtx({ scenes: [scene] })

    const hide: QaxMacro = {
      name: 'hide',
      label: 'Hide',
      params: [{ name: 't', type: 'MolCoord' }],
      items: [{ kind: 'op', name: 'set_visible', args: [{ name: 'nodeId', param: 't' }, { name: 'nodeType', text: 'object' }, { name: 'visible', text: 'false' }] }],
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qax-lib-'))
    const file = path.join(dir, 'hide.qax')
    fs.writeFileSync(file, writeQax({ version: 1, actions: [], macros: [hide] }))

    const res = await runLibraryEntry(ctx, { sceneId: scene.uid, viewId: 0, file, macro: 'hide', targetIds: [a.uid, map.uid, b.uid] })
    if (!res.ok) throw new Error(res.error)
    expect(res.done).toBe(2)
    expect(res.failures).toEqual([{ target: 'map', error: expect.stringContaining('MolCoord') }])
    expect([a.visible, map.visible, b.visible]).toEqual([false, true, false])
    expect(scene.undo.started[0]).toBe('Hide (3 objects)')
    expect(scene.undo.rolledBack).toEqual([])
  })
})
