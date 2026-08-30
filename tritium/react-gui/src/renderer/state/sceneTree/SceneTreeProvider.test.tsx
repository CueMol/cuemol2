/**
 * @file state/sceneTree/SceneTreeProvider.test.tsx
 * @description What the scene-tree provider hands out, and what it mounts.
 *
 * Two contexts -- the state the rows render from and an actions bundle that
 * keeps its identity so they can be memoized -- plus the command handlers,
 * which need both the tree operations and the active scene and so can only
 * be mounted here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import { SceneTreeProvider, useSceneTreeActions, useSceneTreeState, type SceneTreeState } from './SceneTreeProvider'
import type { SceneTreeActions } from './useSceneTreeController'

void React

const node = (partial: Partial<SceneTreeNode>): SceneTreeNode =>
  ({ children: [], ...partial }) as SceneTreeNode

const fake = vi.hoisted(() => ({ tree: null as unknown, selectedId: '' }))
const mounted = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({ useCueMol: () => ({ cm: null, cueMolReady: false }) }))
vi.mock('@renderer/state/workspace', () => ({
  useActiveScene: () => ({ activeSceneId: 1, activeMolViewId: 5, hasScene: true }),
}))
vi.mock('@renderer/features/scene/useSceneTree', () => ({
  useSceneTree: () => ({
    tree: fake.tree,
    selectedId: fake.selectedId,
    selectedIds: new Set(fake.selectedId ? [fake.selectedId] : []),
    selectedNode: null,
    selectedHasOps: { focus: true, delete: true, property: true, add: true },
    setSelectedId: vi.fn(), toggleInSelection: vi.fn(), selectRangeTo: vi.fn(), refetch: vi.fn(),
    setNodeUiCollapsed: vi.fn(), moveSceneNode: vi.fn(), focusNode: vi.fn(),
    renameNode: vi.fn(), renameCamera: vi.fn(),
  }),
}))
vi.mock('@renderer/features/scene/useSceneContextMenu', () => ({
  useSceneContextMenu: () => ({ openContextMenu: vi.fn() }),
}))
vi.mock('@renderer/hooks/useClipboardScope', () => ({ useClipboardScope: () => undefined }))
vi.mock('@renderer/commands/CommandRegistry', () => ({ useCommands: () => ({ dispatch: vi.fn() }) }))
// The handlers themselves are covered by their own tests; here only that
// they are mounted, with the tree and the scene they need.
vi.mock('./commands', () => ({
  SceneTreeCommands: (props: Record<string, unknown>) => {
    mounted.props = props
    return null
  },
  useSceneNewFlows: () => ({ openNewRendererFlow: vi.fn(), openNewCameraFlow: vi.fn() }),
}))

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
  mounted.props = null
  fake.selectedId = ''
  fake.tree = node({
    id: 1, type: 'scene', name: 'S',
    children: [node({ id: 10, type: 'object', name: 'mol', children: [node({ id: 11, type: 'renderer', name: 'rib' })] })],
  })
})

describe('SceneTreeProvider', () => {
  it('publishes the tree and the selection as state', () => {
    fake.selectedId = '11'
    const h = mount()
    expect(h.state.tree).toBe(fake.tree)
    expect(h.state.selectedId).toBe('11')
    expect(h.state.selectedIds).toEqual(new Set(['11']))
    expect(h.state.editingNodeId).toBeNull()
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

  it('mounts the command handlers with the live tree and the active scene', () => {
    const h = mount()
    expect(mounted.props).toMatchObject({
      sceneId: 1,
      activeViewId: 5,
      scene: expect.objectContaining({ tree: fake.tree }),
    })
    // The rename editor is the controller's, so the handlers get its opener.
    expect(typeof mounted.props!.beginInlineRename).toBe('function')
    h.unmount()
  })
})
