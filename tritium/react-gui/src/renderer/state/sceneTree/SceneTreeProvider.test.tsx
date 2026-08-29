/**
 * @file state/sceneTree/SceneTreeProvider.test.tsx
 * @description The one thing that leaves the scene-tree provider: opening a
 * row in the inspector hands over a resolved target, and the actions keep
 * their identity while the tree and the selection change.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { mountTree } from '../../__test__/helpers/testHarness'
import type { SceneTreeNode } from '../../worker/shared/sceneTreeTypes'
import { SceneTreeProvider, useSceneTreeActions, useSceneTreeState, type SceneTreeState } from './SceneTreeProvider'
import type { SceneTreeActions } from './useSceneTreeController'

void React

const node = (partial: Partial<SceneTreeNode>): SceneTreeNode =>
  ({ children: [], ...partial }) as SceneTreeNode

const fake = vi.hoisted(() => ({
  tree: null as unknown,
  selectedId: '',
  showNode: vi.fn(),
}))

vi.mock('../../hooks/cuemol/useCueMol', () => ({ useCueMol: () => ({ cm: null, cueMolReady: false }) }))
vi.mock('../workspace', () => ({
  useActiveScene: () => ({ activeSceneId: 1, activeMolViewId: 5, hasScene: true }),
}))
vi.mock('../inspector', async () => ({
  ...(await import('../inspector/resolveNodeTarget')),
  useInspectorActions: () => ({ showNode: fake.showNode }),
}))
vi.mock('../../hooks/useSceneTree', () => ({
  useSceneTree: () => ({
    tree: fake.tree,
    selectedId: fake.selectedId,
    selectedIds: new Set(fake.selectedId ? [fake.selectedId] : []),
    selectedNode: null,
    selectedHasOps: { focus: true, delete: true, property: true, add: true },
    setSelectedId: vi.fn(), toggleInSelection: vi.fn(), selectRangeTo: vi.fn(), refetch: vi.fn(),
    toggleVisibility: vi.fn(), setNodeUiCollapsed: vi.fn(), moveSceneNode: vi.fn(),
    focusNode: vi.fn(), deleteNode: vi.fn(), renameNode: vi.fn(), renameCamera: vi.fn(),
    applyCameraToView: vi.fn(), copyNode: vi.fn(), pasteNode: vi.fn(),
    bulkCopyNodes: vi.fn(), bulkDeleteNodes: vi.fn(),
  }),
}))
vi.mock('../../hooks/useSceneContextMenu', () => ({
  useSceneContextMenu: () => ({
    openContextMenu: vi.fn(), openNewRendererFlow: vi.fn(), openNewCameraFlow: vi.fn(),
  }),
}))
vi.mock('../../hooks/useClipboardScope', () => ({ useClipboardScope: () => undefined }))
vi.mock('../../components/dialogs/ErrorAlertDialogProvider', () => ({ useShowErrorAlert: () => vi.fn() }))

function mount() {
  let state!: SceneTreeState
  let actions!: SceneTreeActions
  const Probe: React.FC = () => {
    state = useSceneTreeState()
    actions = useSceneTreeActions()
    return null
  }
  const tree = () => <SceneTreeProvider><Probe /></SceneTreeProvider>
  const { root, unmount } = mountTree(tree())
  return {
    get state() { return state },
    get actions() { return actions },
    rerender: () => act(() => root.render(tree())),
    unmount,
  }
}

beforeEach(() => {
  fake.showNode.mockClear()
  fake.selectedId = ''
  fake.tree = node({
    id: 1, type: 'scene', name: 'S',
    children: [node({ id: 10, type: 'object', name: 'mol', children: [node({ id: 11, type: 'renderer', name: 'rib' })] })],
  })
})

describe('SceneTreeProvider', () => {
  it('showProperty resolves the row against the live tree and hands the inspector a target', () => {
    const h = mount()
    act(() => h.actions.showProperty('11'))
    expect(fake.showNode).toHaveBeenCalledWith({ kind: 'node', sceneId: 1, nodeId: 11, nodeType: 'renderer' })
    // A row that is not a property-bridge node never reaches the inspector.
    act(() => h.actions.showProperty('999'))
    expect(fake.showNode).toHaveBeenCalledTimes(1)
    h.unmount()
  })

  it('reads the tree that is current when the row is opened, not the one at mount', () => {
    const h = mount()
    fake.tree = node({ id: 1, type: 'scene', name: 'S', children: [node({ id: 20, type: 'object', name: 'late' })] })
    h.rerender()
    act(() => h.actions.showProperty('20'))
    expect(fake.showNode).toHaveBeenCalledWith({ kind: 'node', sceneId: 1, nodeId: 20, nodeType: 'object' })
    h.unmount()
  })

  it('the actions keep their identity across a selection and a tree change', () => {
    const h = mount()
    const first = h.actions
    fake.selectedId = '11'
    h.rerender()
    expect(h.state.selectedId).toBe('11')
    expect(h.actions).toBe(first)
    fake.tree = node({ id: 1, type: 'scene', name: 'S' })
    h.rerender()
    expect(h.actions).toBe(first)
    h.unmount()
  })
})
