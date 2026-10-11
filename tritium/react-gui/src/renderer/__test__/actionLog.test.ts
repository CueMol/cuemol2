/**
 * @file renderer/__test__/actionLog.test.ts
 * @description The action log's contract: one row per undo transaction, in
 * step with the C++ undo stack, filled with the ops that ran inside it.
 *
 * The scene stands in for C++ `UndoManager` as it behaves: a nested
 * start/commit is absorbed into the outer one (whose label wins), a commit
 * with no change adds nothing but still drops the redo side, and undo / redo
 * fire no event. What is checked is that the rows follow that stack without
 * being told, and that an op is recorded once, by the path it had before it
 * ran.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import { fakeObject, fakeRenderer, fakeScene, makeWorkerCtx } from '@renderer/worker/testing'
import type { FakeScene } from '@renderer/worker/testing'
import { actionRows, resetActionLog } from '@renderer/worker/server/actions/actionLog'
import { recordOp } from '@renderer/worker/server/actions/serviceOps'
import { withUndoTxn, undoTxnResult } from '@renderer/worker/server/services/withUndoTxn'
import { invokeOp, runInTxn } from '@renderer/worker/server/catalog/opRuntime'
import type { AnyOp } from '@renderer/worker/server/catalog/op'
import { fail } from '@renderer/worker/shared/result'

/** A scene whose undo stack behaves as the C++ one does. */
interface StackScene extends FakeScene {
  /** Make the open transaction non-empty, as a C++ mutation would. */
  touch(): void
  undoOne(): void
  redoOne(): void
  clearStack(): void
}

function stackScene(uid = 1): StackScene {
  const scene = fakeScene({ uid }) as StackScene
  const done: string[] = []
  const redo: string[] = []
  let depth = 0
  let label = ''
  let changed = false
  Object.assign(scene, {
    startUndoTxn: (l: string) => {
      if (depth++ === 0) {
        label = l
        changed = false
      }
    },
    commitUndoTxn: () => {
      if (--depth > 0) return
      if (changed) done.push(label)
      redo.length = 0
    },
    rollbackUndoTxn: () => {
      depth = Math.max(0, depth - 1)
    },
    getUndoSize: () => done.length,
    getUndoDesc: (i: number) => done[done.length - 1 - i],
    getRedoSize: () => redo.length,
    getRedoDesc: (i: number) => redo[redo.length - 1 - i],
    touch: () => { changed = true },
    undoOne: () => { redo.push(done.pop() as string) },
    redoOne: () => { done.push(redo.pop() as string) },
    clearStack: () => { done.length = 0; redo.length = 0 },
  })
  return scene
}

const asScene = (s: FakeScene): Scene => s as unknown as Scene

/** An edit through the GUI path: one transaction that changes the scene. */
function edit(scene: StackScene, label: string): void {
  withUndoTxn(asScene(scene), label, () => scene.touch())
}

const rowsOf = (scene: StackScene) => actionRows(asScene(scene), scene.uid)

describe('actionLog', () => {
  beforeEach(() => resetActionLog())

  it('makes one row per outer transaction, keeping committed inner entries only', async () => {
    const scene = stackScene()
    const { ctx } = makeWorkerCtx({ scenes: [scene] })
    await runInTxn(asScene(scene), 'outer', () => true, async () => {
      withUndoTxn(asScene(scene), 'inner', () => {
        scene.touch()
        recordOp(ctx, scene.uid, 'kept', {})
      })
      undoTxnResult(asScene(scene), 'failed', () => {
        recordOp(ctx, scene.uid, 'dropped', {})
        return fail('no')
      })
    })
    // A read-only run (rolled back) and an empty commit leave no row.
    await runInTxn(asScene(scene), 'read', () => false, async () => undefined)
    withUndoTxn(asScene(scene), 'empty', () => undefined)

    const rows = rowsOf(scene)
    expect(rows.map((r) => r.label)).toEqual(['outer'])
    expect(rows[0].source).toBe('cmd')
    expect(rows[0].entries.map((e) => (e.kind === 'op' ? e.op : e.text))).toEqual(['kept'])
  })

  it('follows undo and redo, and a new edit drops the undone rows', () => {
    const scene = stackScene()
    edit(scene, 'a')
    edit(scene, 'b')
    edit(scene, 'c')
    scene.undoOne()
    scene.undoOne()
    expect(rowsOf(scene).map((r) => r.undone)).toEqual([false, true, true])
    scene.redoOne()
    expect(rowsOf(scene).map((r) => r.undone)).toEqual([false, false, true])

    edit(scene, 'd')
    expect(rowsOf(scene).map((r) => `${r.label}${r.undone ? '*' : ''}`)).toEqual(['a', 'b', 'd'])
    // An empty commit after an undo also drops the redo side, as C++ does.
    scene.undoOne()
    withUndoTxn(asScene(scene), 'empty', () => undefined)
    expect(rowsOf(scene).map((r) => r.label)).toEqual(['a', 'b'])
  })

  it('rebuilds rows the stack no longer holds, and forgets a scene that is gone', () => {
    const scene = stackScene()
    edit(scene, 'a')
    scene.clearStack()
    expect(rowsOf(scene)).toEqual([])
    // A stack that changed behind the log (a scene load) shows as bare rows.
    scene.startUndoTxn('loaded')
    scene.touch()
    scene.commitUndoTxn()
    expect(rowsOf(scene)).toEqual([{ label: 'loaded', source: null, time: null, entries: [], undone: false }])
    expect(actionRows(null, scene.uid)).toEqual([])
  })

  it('records an op once, by its path before it ran, and a replay op only on commit', async () => {
    const scene = stackScene()
    const mol = fakeObject({ name: '1crn', scene })
    scene.addObject(mol)
    const rend = fakeRenderer({ type: 'cartoon', name: 'cartoon1' })
    mol.attachRenderer(rend)
    const { ctx } = makeWorkerCtx({ scenes: [scene] })
    const oc = { sceneId: scene.uid, viewId: 0, callId: 'c', markMutated: () => undefined } as never

    // Renames the renderer through a GUI service, which must not record itself.
    const rename = {
      name: 'rename_node',
      params: { nodeId: { kind: 'integer', semantic: 'renderer' }, name: { kind: 'string' } },
      mutates: true,
      run: (c: typeof ctx, args: Record<string, unknown>) => {
        withUndoTxn(asScene(scene), 'Rename', () => {
          scene.touch()
          recordOp(c, scene.uid, 'rename_node', args, ['nodeId'])
          rend.name = String(args.name)
        })
        return { ok: true }
      },
    } as unknown as AnyOp
    const turn = { name: 'rotate_view', params: {}, mutates: false, replay: true, run: () => ({ ok: true }) } as unknown as AnyOp

    await runInTxn(asScene(scene), 'cmd: rename', () => true, async () => {
      await invokeOp(rename, ctx, { nodeId: rend.uid, name: 'main' }, oc)
      await invokeOp(turn, ctx, {}, oc)
    })
    // A read-only run rolls back, so the view op it ran is not kept.
    await runInTxn(asScene(scene), 'cmd: turn', () => false, async () => {
      await invokeOp(turn, ctx, {}, oc)
    })

    const rows = rowsOf(scene)
    expect(rows).toHaveLength(1)
    expect(rows[0].entries).toEqual([
      { kind: 'op', op: 'rename_node', args: { nodeId: rend.uid, name: 'main' }, refs: { nodeId: '1crn/cartoon1' } },
      { kind: 'op', op: 'rotate_view', args: {}, refs: {} },
    ])
  })
})

describe('serviceOps', () => {
  beforeEach(() => resetActionLog())

  it('records each GUI edit as arguments its op reads back', async () => {
    const { findOp } = await import('@renderer/worker/server/catalog')
    const { readToolArgs } = await import('@renderer/worker/server/catalog/toolSchema')
    const ops = await import('@renderer/worker/server/actions/serviceOps')
    const scene = stackScene()
    const mol = fakeObject({ name: '1crn', scene })
    scene.addObject(mol)
    const rend = fakeRenderer({ type: 'cartoon', name: 'cartoon1' })
    mol.attachRenderer(rend)
    const { ctx } = makeWorkerCtx({ scenes: [scene] })
    const choice = { rendererType: 'simple', rendererName: 'simple1', selectionEnabled: true, selection: 'resid 1:5' }

    withUndoTxn(asScene(scene), 'gui', () => {
      scene.touch()
      ops.recordPropWrite(ctx, scene.uid, { nodeType: 'rendGroup', nodeId: rend.uid, propName: 'width', op: 'set', value: 2 })
      ops.recordPropWrite(ctx, scene.uid, { nodeType: 'scene', nodeId: scene.uid, propName: 'bgcolor', op: 'set', value: '#fff' })
      ops.recordPropWrite(ctx, scene.uid, { nodeType: 'renderer', nodeId: rend.uid, propName: 'width', op: 'reset' })
      ops.recordDeleteNode(ctx, scene.uid, 'renderer', rend.uid)
      ops.recordRenameNode(ctx, scene.uid, 'object', mol.uid, 'x')
      ops.recordRenameNode(ctx, scene.uid, 'scene', scene.uid, 'x')
      ops.recordCreateRenderer(ctx, scene.uid, mol.uid, choice, { rendId: rend.uid, groupName: 'g' })
      ops.recordChangeRendererType(ctx, scene.uid, rend.uid, 'ribbon')
      ops.recordLoadFile(ctx, scene.uid, '/tmp/1crn.pdb', { ...choice, objectName: '1crn' })
    })

    const entries = rowsOf(scene)[0].entries
    expect(entries).toHaveLength(10)
    for (const e of entries) {
      if (e.kind !== 'op') throw new Error(`not an op: ${e.text}`)
      const op = findOp(e.op)
      expect(op, e.op).toBeDefined()
      // No argument the op does not take (a qax file would drop it), and
      // every one it needs.
      expect(Object.keys(e.args).filter((k) => !(k in op!.params)), e.op).toEqual([])
      expect(typeof readToolArgs(op!, e.args), `${e.op}: ${String(readToolArgs(op!, e.args))}`).toBe('object')
    }
    expect(entries[2]).toMatchObject({ op: 'reset_prop', args: { path: '1crn/cartoon1.width' } })
  })
})
