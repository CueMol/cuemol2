/**
 * @file __test__/helpers/sceneTreeEnv.tsx
 * @description Stand-in for the scene-tree provider in ScenePane tests.
 *
 * ScenePane reads the tree, the selection and its actions from
 * `state/sceneTree`. A test mocks that module with `mockSceneTreeModule()`
 * and describes one mount with `withSceneTree({...}, <ScenePane />)`, naming
 * the state and the callbacks it cares about; everything else is a spy.
 */

import { vi } from 'vitest'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import type { SceneTreeState, SceneTreeActions } from '@renderer/state/sceneTree'

export interface SceneTreeEnvProps {
  tree: SceneTreeNode | null
  selectedId?: string
  selectedIds?: Set<string>
  editingNodeId?: string | null
  opsEnabled?: SceneTreeState['selectedHasOps']
  onSelect?: SceneTreeActions['select']
  onToggleSelect?: SceneTreeActions['toggleSelect']
  onSelectRange?: SceneTreeActions['selectRange']
  onToggleVisibility?: SceneTreeActions['toggleVisibility']
  onShowProperty?: SceneTreeActions['showProperty']
  onFocusSelected?: SceneTreeActions['focusSelected']
  onDeleteSelected?: SceneTreeActions['deleteSelected']
  onAddRenderer?: SceneTreeActions['addSelected']
  onNodeDoubleClick?: SceneTreeActions['nodeDoubleClick']
  onBeginInlineRename?: SceneTreeActions['beginInlineRename']
  onCancelInlineRename?: SceneTreeActions['cancelInlineRename']
  onCommitInlineRename?: SceneTreeActions['commitInlineRename']
  onShowContextMenu?: SceneTreeActions['showContextMenu']
  onMoveNode?: SceneTreeActions['moveNode']
  onNodeExpandChange?: SceneTreeActions['nodeExpandChange']
}

const ALL_OPS = { focus: true, delete: true, property: true, add: true }

export const sceneTreeEnv: { state: SceneTreeState; actions: SceneTreeActions } = {
  state: {
    tree: null, selectedId: '', selectedIds: new Set(), selectedNode: null,
    selectedHasOps: ALL_OPS, editingNodeId: null,
  },
  actions: null as unknown as SceneTreeActions,
}

/** The `vi.mock` factory for `state/sceneTree`. */
export function mockSceneTreeModule() {
  return {
    useSceneTreeState: () => sceneTreeEnv.state,
    useSceneTreeActions: () => sceneTreeEnv.actions,
  }
}

/** Describe the provider state for the next mount and hand back the element. */
export function withSceneTree<T>(p: SceneTreeEnvProps, element: T): T {
  const selectedId = p.selectedId ?? ''
  sceneTreeEnv.state = {
    tree: p.tree,
    selectedId,
    selectedIds: p.selectedIds ?? (selectedId ? new Set([selectedId]) : new Set()),
    selectedNode: null,
    selectedHasOps: p.opsEnabled ?? ALL_OPS,
    editingNodeId: p.editingNodeId ?? null,
  }
  sceneTreeEnv.actions = {
    select: p.onSelect ?? vi.fn(),
    toggleSelect: p.onToggleSelect ?? vi.fn(),
    selectRange: p.onSelectRange ?? vi.fn(),
    toggleVisibility: p.onToggleVisibility ?? vi.fn(),
    showProperty: p.onShowProperty ?? vi.fn(),
    focusSelected: p.onFocusSelected ?? vi.fn(),
    deleteSelected: p.onDeleteSelected ?? vi.fn(),
    addSelected: p.onAddRenderer ?? vi.fn(),
    nodeDoubleClick: p.onNodeDoubleClick ?? vi.fn(),
    beginInlineRename: p.onBeginInlineRename ?? vi.fn(),
    cancelInlineRename: p.onCancelInlineRename ?? vi.fn(),
    commitInlineRename: p.onCommitInlineRename ?? vi.fn(),
    showContextMenu: p.onShowContextMenu ?? vi.fn(),
    moveNode: p.onMoveNode ?? vi.fn(),
    nodeExpandChange: p.onNodeExpandChange ?? vi.fn(),
  }
  return element
}
