/**
 * @file state/undoRedo/UndoRedoProvider.tsx
 * @description Undo / redo availability and history for the active scene.
 *
 * Owns `useUndoRedoState` (which also registers the Undo / Redo commands and
 * mirrors the native Edit menu) so the toolbar reads it from context instead
 * of App passing it down. Below CommandProvider and WorkspaceProvider.
 */

import React, { createContext, useContext } from 'react'
import { useCueMol } from '../../hooks/cuemol/useCueMol'
import { useUndoRedoState, type UndoRedoState } from '../../hooks/useUndoRedoState'
import { useActiveScene } from '../workspace'

const Context = createContext<UndoRedoState | null>(null)

export function useUndoRedo(): UndoRedoState {
  const v = useContext(Context)
  if (v === null) throw new Error('useUndoRedo must be used inside UndoRedoProvider')
  return v
}

export function UndoRedoProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { cm } = useCueMol()
  const { activeSceneId } = useActiveScene()
  const state = useUndoRedoState({ cm, activeSceneId })
  return <Context.Provider value={state}>{children}</Context.Provider>
}
