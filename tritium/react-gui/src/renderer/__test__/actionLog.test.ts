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
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { actionRows, onActionsChanged, resetActionLog } from '@renderer/worker/server/actions/actionLog'
import { getUndoState } from '@renderer/worker/server/services/undo/undoState'
import { undo } from '@renderer/worker/server/services/undo/undo'
import { exportActionSteps } from '@renderer/worker/server/services/actions/actions'
import { parseQax } from '@renderer/worker/server/actions/qax/codec'
import { applyRendererStyleList } from '@renderer/worker/server/services/rend/rendererStyle'
import { removePaintEntries } from '@renderer/worker/server/services/coloring/paintClipboard'
import { reorderSceneNode } from '@renderer/worker/server/services/sceneTree/reorderSceneNode'
import { MAX_RECORDED_ARGS_BYTES, recordOp } from '@renderer/worker/server/actions/serviceOps'
import { describeRow } from '@renderer/worker/server/actions/describe'
import { stepsToMacro } from '@renderer/worker/server/actions/macro'
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
    undo: (depth: number) => {
      for (let i = 0; i <= depth; ++i) redo.push(done.pop() as string)
      return true
    },
  })
  return scene
}

const asScene = (s: FakeScene): Scene => s as unknown as Scene

/** An edit through the GUI path: one transaction that changes the scene. */
function edit(scene: StackScene, label: string): void {
  withUndoTxn(asScene(scene), label, () => scene.touch())
}

const rowsOf = (scene: StackScene) => actionRows(asScene(scene), scene.uid)

/** An edit that records the given ops, as a GUI service does. */
function editWith(scene: StackScene, ctx: ReturnType<typeof makeWorkerCtx>['ctx'], label: string, ops: [string, Record<string, unknown>][]): void {
  withUndoTxn(asScene(scene), label, () => {
    scene.touch()
    for (const [op, args] of ops) recordOp(ctx, scene.uid, op, args)
  })
}

const HIDE: [string, Record<string, unknown>] = ['set_visible', { nodeId: 5, nodeType: 'object', visible: false }]
const CLEAR: [string, Record<string, unknown>] = ['apply_renderer_style', { rendId: 7, style: 'Wide' }]

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
    expect(rowsOf(scene)).toEqual([{ id: expect.any(Number), label: 'loaded', source: null, time: null, entries: [], undone: false }])
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
      ops.recordCreateRenderer(ctx, scene.uid, mol.uid, { ...choice, presetName: 'Default1RendPreset' }, { rendId: rend.uid })
      // The File Open dialog's MTZ options, as the MTZ load op takes them.
      ops.recordLoadFile(ctx, scene.uid, '/tmp/1crn.mtz', {
        format: { kind: 'mtz', options: { columnF: 'FWT', columnPhi: 'PHWT', phaseEnabled: false, columnW: 'FOM', weightEnabled: true, resolutionLimit: 2, gridSpacing: 0.5 } },
        renderer: { ...choice, objectName: '1crn', centerView: false, mapCenterPolicy: 'setMapCenter' },
      })
      // The shapes clipboard/paste.ts and cameraVisFlags.ts record.
      ops.recordOp(ctx, scene.uid, 'paste_node', { kind: 'renderer', form: 'single', xml: '<renderer/>', target: mol.uid, targetType: 'object' }, ['target'])
      ops.recordOp(ctx, scene.uid, 'set_camera_visibility', { name: 'c1', entries: 'on 1crn; off 1crn/cartoon1' })
    })

    const entries = rowsOf(scene)[0].entries
    expect(entries).toHaveLength(13)
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
    expect(entries[9]).toMatchObject({ op: 'create_preset_renderer', args: { preset: 'Default1RendPreset', name: 'simple1' } })
    expect(entries[10]).toMatchObject({
      op: 'load_mtz',
      args: { columnPhi: '', columnWeight: 'FOM', resolutionLimit: 2, centerView: false, mapCenterPolicy: 'setMapCenter' },
    })
  })

  it('records the Interaction analysis dialog with its own settings, as arguments its op reads back', async () => {
    const { findOp } = await import('@renderer/worker/server/catalog')
    const { readToolArgs } = await import('@renderer/worker/server/catalog/toolSchema')
    const { analyzeInteractions } = await import('@renderer/worker/server/services/molops/analyzeInteractions')
    const scene = stackScene()
    const mol = fakeObject({ name: '1crn', scene })
    const mol2 = fakeObject({ name: '2abc', scene })
    scene.addObject(mol)
    scene.addObject(mol2)
    const labels = Object.assign(fakeRenderer({ type: 'atomintr', name: 'measure' }), { appendById: () => scene.touch() })
    mol.attachRenderer(labels)
    const { ctx } = makeWorkerCtx({
      scenes: [scene],
      createObj: () => ({ compile: () => true }),
      getService: () => ({ calcAtomContact3JSON: () => '[[1, 2]]' }),
    })

    // The dialog's defaults (2.5 to 4 A, 30 labels), against a second object.
    const res = analyzeInteractions(ctx, {
      sceneId: scene.uid, objId: mol.uid, selStr: 'ligand', useMol2: true, objId2: mol2.uid, useSel2: false,
      minDist: 2.5, maxDist: 4, maxLabels: 30, hbondOnly: true, rendName: 'measure',
    })
    expect(res.ok).toBe(true)
    const [entry] = rowsOf(scene)[0].entries
    if (entry.kind !== 'op') throw new Error('not an op')
    expect(entry).toMatchObject({ op: 'analyze_interactions', refs: { objId: '1crn', obj2Id: '2abc' } })
    const read = readToolArgs(findOp('analyze_interactions')!, entry.args)
    expect(read).toMatchObject({ minDist: 2.5, maxLabels: 30, obj2Id: mol2.uid, selection2: '' })
  })

  it('records the Edit Style dialog as the whole style list its op takes', async () => {
    const { findOp } = await import('@renderer/worker/server/catalog')
    const { readToolArgs } = await import('@renderer/worker/server/catalog/toolSchema')
    const scene = stackScene()
    const mol = fakeObject({ name: '1crn', scene })
    scene.addObject(mol)
    const rend = fakeRenderer({ type: 'cartoon', name: 'cartoon1' })
    mol.attachRenderer(rend)
    const { ctx } = makeWorkerCtx({ scenes: [scene] })
    rend.applyStyles.mockImplementation(() => scene.touch())

    applyRendererStyleList(ctx as never, { sceneId: scene.uid, rendId: rend.uid, styleNames: [' DefaultCartoon', 'EgLineCartoon '] })

    const [entry] = rowsOf(scene)[0].entries
    expect(entry).toEqual({
      kind: 'op',
      op: 'set_renderer_styles',
      args: { rendId: rend.uid, styles: 'DefaultCartoon,EgLineCartoon' },
      refs: { rendId: '1crn/cartoon1' },
    })
    expect(rend.applyStyles).toHaveBeenCalledWith('DefaultCartoon,EgLineCartoon')
    expect(typeof readToolArgs(findOp('set_renderer_styles')!, (entry as { args: Record<string, unknown> }).args)).toBe('object')
  })

  it('records a paint edit on an object (the Color pane default) with the object as the target', async () => {
    const { findOp } = await import('@renderer/worker/server/catalog')
    const { readToolArgs } = await import('@renderer/worker/server/catalog/toolSchema')
    const scene = stackScene()
    const mol = fakeObject({ name: '1crn', scene })
    scene.addObject(mol)
    const rows = ['sheet', 'helix', '*']
    Object.assign(mol, {
      coloring: {
        getClassName: () => 'PaintColoring',
        get size() { return rows.length },
        removeAt: (i: number) => { rows.splice(i, 1); scene.touch() },
      },
      hasPropDefault: () => false,
    })
    const { ctx } = makeWorkerCtx({ scenes: [scene] })

    removePaintEntries(ctx as never, { sceneId: scene.uid, rendId: mol.uid, targetKind: 'object', idxs: [0, 2] })

    const entries = rowsOf(scene)[0].entries
    // Highest row first, as they are removed, so each number is still right on replay.
    expect(entries).toEqual([
      { kind: 'op', op: 'remove_paint', args: { nodeId: mol.uid, nodeType: 'object', number: 3 }, refs: { nodeId: '1crn' } },
      { kind: 'op', op: 'remove_paint', args: { nodeId: mol.uid, nodeType: 'object', number: 1 }, refs: { nodeId: '1crn' } },
    ])
    expect(typeof readToolArgs(findOp('remove_paint')!, (entries[0] as { args: Record<string, unknown> }).args)).toBe('object')
  })

  it('records a drag in the scene tree by the places the node went, so a cut-out step means the same in a longer list', async () => {
    const { findOp } = await import('@renderer/worker/server/catalog')
    const { readToolArgs } = await import('@renderer/worker/server/catalog/toolSchema')
    const scene = stackScene()
    const mols = ['a', 'b', 'c'].map((name, i) => {
      const mol = fakeObject({ name, scene, ui_order: i })
      mol.sets.ui_order.mockImplementation(() => scene.touch())
      scene.addObject(mol)
      return mol
    })
    const { ctx } = makeWorkerCtx({ scenes: [scene] })

    // Drop c before a: two places up.
    reorderSceneNode(ctx as never, { kind: 'object', sceneId: scene.uid, sourceId: mols[2].uid, targetId: mols[0].uid, ori: -1 })

    const [entry] = rowsOf(scene)[0].entries
    expect(entry).toMatchObject({ op: 'move_node', args: { nodeId: mols[2].uid, nodeType: 'object', by: -2, to: null, end: null }, refs: { nodeId: 'c' } })
    expect(typeof readToolArgs(findOp('move_node')!, (entry as { args: Record<string, unknown> }).args)).toBe('object')
  })

  it('words each undo step from its ops, and falls back to the undo description', () => {
    const scene = stackScene()
    const { ctx } = makeWorkerCtx({ scenes: [scene] })
    editWith(scene, ctx, 'hide', [HIDE])
    editWith(scene, ctx, 'clear', [CLEAR])
    editWith(scene, ctx, 'both', [HIDE, CLEAR])
    editWith(scene, ctx, 'bare', [])
    scene.undoOne()
    const state = getUndoState(ctx, { sceneId: scene.uid })
    // describe() of the op; an op without one is its name and arguments; a
    // step of several ops is its first and a count. The undone step with no
    // op keeps its description, on the redo side.
    expect(state.undoTexts).toEqual(['Hide #5 (+1 more)', 'Apply renderer style: #7, Wide', 'Hide #5'])
    expect(state.redoTexts).toEqual(['bare'])
    expect(state.undoDescs).toEqual(['both', 'clear', 'hide'])
  })

  it('tells the renderer the history moved after an undo, which C++ does not', () => {
    const scene = stackScene()
    const { ctx } = makeWorkerCtx({ scenes: [scene] })
    edit(scene, 'a')
    rowsOf(scene)
    const changed: number[] = []
    onActionsChanged((id) => changed.push(id))
    undo(ctx, { sceneId: scene.uid })
    expect(changed).toEqual([scene.uid])
    expect(rowsOf(scene).map((r) => r.undone)).toEqual([true])
  })

  it('keeps a note, not the op, when its arguments are over the size limit, and no macro takes it', () => {
    const scene = stackScene()
    const { ctx } = makeWorkerCtx({ scenes: [scene] })
    editWith(scene, ctx, 'Paste object', [['paste_node', { xml: 'x'.repeat(MAX_RECORDED_ARGS_BYTES) }]])
    const [row] = rowsOf(scene)
    expect(row.entries).toEqual([expect.objectContaining({ kind: 'note', dropped: expect.objectContaining({ op: 'paste_node' }) })])
    expect(describeRow(row)).toContain('not recorded: paste_node')
    expect(stepsToMacro([row], { name: 'm', classOf: () => 'MolCoord' })).toEqual({ ok: false, error: expect.stringContaining('was not recorded') })
  })

  it('writes the steps named by id to a qax file, and refuses a step that is gone', () => {
    const scene = stackScene()
    const { ctx } = makeWorkerCtx({ scenes: [scene] })
    editWith(scene, ctx, 'hide', [HIDE])
    editWith(scene, ctx, 'clear', [CLEAR])
    editWith(scene, ctx, 'again', [HIDE])
    const ids = rowsOf(scene).map((r) => r.id)
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qax-')), 'steps.qax')

    expect(exportActionSteps(ctx, { sceneId: scene.uid, stepIds: [ids[2], ids[0]], filePath: file })).toEqual({ ok: true, count: 2 })
    const doc = parseQax(fs.readFileSync(file, 'utf8'))
    if ('error' in doc) throw new Error(doc.error)
    expect(doc.actions.map((a) => a.label)).toEqual(['hide', 'again'])
    expect(doc.actions[0].items).toMatchObject([{ kind: 'op', name: 'set_visible' }])

    scene.clearStack()
    expect(exportActionSteps(ctx, { sceneId: scene.uid, stepIds: [ids[0]], filePath: file })).toMatchObject({ ok: false, code: 'not-found' })
  })
})
