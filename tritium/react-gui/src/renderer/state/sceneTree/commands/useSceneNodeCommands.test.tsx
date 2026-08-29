/**
 * @file state/sceneTree/commands/useSceneNodeCommands.test.tsx
 * @description The scene-tree node operations, as commands.
 *
 * These are the ones with several entry points -- the context menu, the tree
 * toolbar, the Edit menu -- so each takes the ids to act on. What is pinned
 * here is what each does with them: which worker call a single row takes
 * versus a multi-selection, that Copy reports whether it landed (Cut depends
 * on it), and that opening a row in the inspector resolves it against the
 * live tree.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import { CommandProvider, useCommands } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import { useSceneNodeCommands } from './useSceneNodeCommands'

void React

const showNode = vi.hoisted(() => vi.fn())
const showErrorAlert = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../../inspector', async () => ({
  ...(await import('../../inspector/resolveNodeTarget')),
  useInspectorActions: () => ({ showNode }),
}))
vi.mock('../../../components/dialogs/ErrorAlertDialogProvider', () => ({
  useShowErrorAlert: () => showErrorAlert,
}))

const node = (partial: Partial<SceneTreeNode>): SceneTreeNode =>
  ({ children: [], ...partial }) as SceneTreeNode

const tree = node({
  id: 1, type: 'scene', name: 'S',
  children: [
    node({ id: 10, type: 'object', name: 'mol', children: [node({ id: 11, type: 'renderer', name: 'rib' })] }),
  ],
})

function makeScene(overrides: Record<string, unknown> = {}) {
  return {
    tree,
    toggleVisibility: vi.fn(),
    bulkSetNodeVisible: vi.fn().mockResolvedValue(true),
    deleteNode: vi.fn().mockResolvedValue(true),
    bulkDeleteNodes: vi.fn().mockResolvedValue(true),
    copyNode: vi.fn().mockResolvedValue(true),
    bulkCopyNodes: vi.fn().mockResolvedValue({ ok: true }),
    pasteNode: vi.fn().mockResolvedValue(true),
    selectObjectMol: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

type Scene = ReturnType<typeof makeScene>

/** Mount the handlers behind a real registry and hand back its dispatch. */
function mount(scene: Scene, beginInlineRename = vi.fn()) {
  let dispatch!: ReturnType<typeof useCommands>['dispatch']
  const Host: React.FC = () => {
    useSceneNodeCommands({ scene: scene as never, beginInlineRename })
    dispatch = useCommands().dispatch
    return null
  }
  const { unmount } = mountTree(
    <CommandProvider>
      <Host />
    </CommandProvider>,
  )
  return { get dispatch() { return dispatch }, beginInlineRename, unmount }
}

beforeEach(() => vi.clearAllMocks())

describe('scene-node commands', () => {
  it('a single row toggles its own visibility; a selection is set outright', async () => {
    const scene = makeScene()
    const h = mount(scene)
    await act(async () => { await h.dispatch(CmdId.SceneNodeSetVisible, { ids: ['10'] }) })
    expect(scene.toggleVisibility).toHaveBeenCalledWith('10')
    expect(scene.bulkSetNodeVisible).not.toHaveBeenCalled()

    // Rows that disagree must end up the same, so the multi path is explicit.
    await act(async () => {
      await h.dispatch(CmdId.SceneNodeSetVisible, { ids: ['10', '11'], visible: false })
    })
    expect(scene.bulkSetNodeVisible).toHaveBeenCalledWith(['10', '11'], false)
    h.unmount()
  })

  it('deletes a selection under one transaction, a single row through its own path', async () => {
    const scene = makeScene()
    const h = mount(scene)
    await act(async () => { await h.dispatch(CmdId.SceneNodeDelete, { ids: ['10', '11'] }) })
    expect(scene.bulkDeleteNodes).toHaveBeenCalledWith(['10', '11'])
    expect(scene.deleteNode).not.toHaveBeenCalled()

    await act(async () => { await h.dispatch(CmdId.SceneNodeDelete, { ids: ['10'] }) })
    // The single path also covers cameras and styles, which have no bulk form.
    expect(scene.deleteNode).toHaveBeenCalledWith('10')
    h.unmount()
  })

  it('copy reports whether anything reached the clipboard', async () => {
    const scene = makeScene()
    const h = mount(scene)
    let landed: unknown
    await act(async () => { landed = await h.dispatch(CmdId.SceneNodeCopy, { ids: ['11'] }) })
    expect(scene.copyNode).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }))
    expect(landed).toBe(true)

    await act(async () => { landed = await h.dispatch(CmdId.SceneNodeCopy, { ids: ['10', '11'] }) })
    expect(scene.bulkCopyNodes).toHaveBeenCalledWith(['10', '11'])
    expect(landed).toBe(true)

    // Nothing selected: nothing copied, and it says so.
    await act(async () => { landed = await h.dispatch(CmdId.SceneNodeCopy, { ids: [] }) })
    expect(landed).toBe(false)
    h.unmount()
  })

  it('reports UXP\'s wording for a refused multi-copy, and says it did not land', async () => {
    const scene = makeScene({
      bulkCopyNodes: vi.fn().mockResolvedValue({ ok: false, reason: 'mixed' }),
    })
    const h = mount(scene)
    let landed: unknown
    await act(async () => { landed = await h.dispatch(CmdId.SceneNodeCopy, { ids: ['10', '11'] }) })
    expect(showErrorAlert).toHaveBeenCalledWith({
      title: 'Copy',
      message: 'Multiple items with different types selected.',
    })
    expect(landed).toBe(false)
    h.unmount()

    const objects = makeScene({
      bulkCopyNodes: vi.fn().mockResolvedValue({ ok: false, reason: 'objectUnsupported' }),
    })
    const h2 = mount(objects)
    await act(async () => { await h2.dispatch(CmdId.SceneNodeCopy, { ids: ['10', '11'] }) })
    expect(showErrorAlert).toHaveBeenLastCalledWith({
      title: 'Copy',
      message: 'Multiple copy of object: not supported.',
    })
    h2.unmount()
  })

  it('pastes onto the row named by the target id', async () => {
    const scene = makeScene()
    const h = mount(scene)
    await act(async () => { await h.dispatch(CmdId.SceneNodePaste, { targetId: '11' }) })
    expect(scene.pasteNode).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }))

    // An id that is not in the tree does nothing.
    scene.pasteNode.mockClear()
    await act(async () => { await h.dispatch(CmdId.SceneNodePaste, { targetId: '999' }) })
    expect(scene.pasteNode).not.toHaveBeenCalled()
    h.unmount()
  })

  it('opening a row in the inspector resolves it against the live tree', async () => {
    const h = mount(makeScene())
    await act(async () => { await h.dispatch(CmdId.SceneNodeProperty, { id: '11' }) })
    expect(showNode).toHaveBeenCalledWith({
      kind: 'node', sceneId: 1, nodeId: 11, nodeType: 'renderer',
    })

    // A row that is not a property-bridge node never reaches the inspector.
    showNode.mockClear()
    await act(async () => { await h.dispatch(CmdId.SceneNodeProperty, { id: '999' }) })
    expect(showNode).not.toHaveBeenCalled()
    h.unmount()
  })

  it('rename opens the inline editor rather than a dialog', async () => {
    const h = mount(makeScene())
    await act(async () => { await h.dispatch(CmdId.SceneNodeRenameBegin, { id: '11' }) })
    expect(h.beginInlineRename).toHaveBeenCalledWith('11')
    h.unmount()
  })

  it('selectMol passes the kind the menu picked', async () => {
    const scene = makeScene()
    const h = mount(scene)
    await act(async () => {
      await h.dispatch(CmdId.SceneNodeSelectMol, { id: '10', selectKind: 'all' as never })
    })
    expect(scene.selectObjectMol).toHaveBeenCalledWith('10', 'all')
    h.unmount()
  })
})
