/**
 * @file state/sceneTree/SceneTreeProvider.tsx
 * @description The active scene's tree, its selection, and what the
 * Explorer can do with it.
 *
 * Owns `useSceneTree` (the fetch and the selection) and the controller on
 * top of it (rename editor, toolbar / keyboard / double-click handlers, the
 * clipboard scope, the context menu). Two contexts:
 *   - useSceneTreeState()    tree / selection / rename editor; re-renders
 *                            the rows
 *   - useSceneTreeActions()  identity-stable for the provider's lifetime
 *
 * Also mounts the tree's command handlers: they need both the tree
 * operations and the active scene, and this is the only place holding
 * both. Every gesture -- a toolbar button, a key, the context menu --
 * dispatches to them, so there is one implementation per operation.
 */

import React, { createContext, useContext, useMemo } from 'react'
import type { SceneTreeNode } from '../../worker/shared/sceneTreeTypes'
import { useSceneTree, type SceneTreeSelectionOps } from '../../hooks/useSceneTree'
import { useCueMol } from '../../hooks/cuemol/useCueMol'
import { useActiveScene } from '../workspace'
import { useSceneTreeController, type SceneTreeActions } from './useSceneTreeController'
import { SceneTreeCommands, useSceneNewFlows } from './commands'

export interface SceneTreeState {
  tree: SceneTreeNode | null
  selectedId: string
  selectedIds: Set<string>
  selectedNode: SceneTreeNode | null
  /** Per-action enablement for the current selection. */
  selectedHasOps: SceneTreeSelectionOps
  /** Row showing the inline-rename editor, or null. */
  editingNodeId: string | null
}

const StateContext = createContext<SceneTreeState | null>(null)
const ActionsContext = createContext<SceneTreeActions | null>(null)

export function useSceneTreeState(): SceneTreeState {
  const v = useContext(StateContext)
  if (!v) throw new Error('useSceneTreeState must be used inside SceneTreeProvider')
  return v
}

export function useSceneTreeActions(): SceneTreeActions {
  const v = useContext(ActionsContext)
  if (!v) throw new Error('useSceneTreeActions must be used inside SceneTreeProvider')
  return v
}

export function SceneTreeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { cm } = useCueMol()
  const { activeSceneId, activeMolViewId } = useActiveScene()
  const scene = useSceneTree({ cm, sceneId: activeSceneId })

  const { editingNodeId, actions } = useSceneTreeController({
    scene,
    cm,
    activeSceneId,
    activeMolViewId,
  })

  const flows = useSceneNewFlows({ cm, sceneId: activeSceneId, activeViewId: activeMolViewId, scene })

  const state = useMemo<SceneTreeState>(
    () => ({
      tree: scene.tree,
      selectedId: scene.selectedId,
      selectedIds: scene.selectedIds,
      selectedNode: scene.selectedNode,
      selectedHasOps: scene.selectedHasOps,
      editingNodeId,
    }),
    [scene.tree, scene.selectedId, scene.selectedIds, scene.selectedNode, scene.selectedHasOps, editingNodeId],
  )

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>
        <SceneTreeCommands
          cm={cm}
          sceneId={activeSceneId}
          activeViewId={activeMolViewId}
          scene={scene}
          beginInlineRename={actions.beginInlineRename}
          {...flows}
        />
        {children}
      </StateContext.Provider>
    </ActionsContext.Provider>
  )
}
