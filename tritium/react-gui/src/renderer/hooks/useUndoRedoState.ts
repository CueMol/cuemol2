/**
 * @file hooks/useUndoRedoState.ts
 * @description Single owner of the active scene's undo/redo state for the
 * renderer: availability flags + the ordered transaction descriptions used by
 * the toolbar history dropdown. Also registers the Undo/Redo commands, keeps
 * the native Edit menu enabled-state in sync, and refreshes on the relevant
 * scene events.
 *
 * Mirrors UXP `Qm2Main.updateCmdUndoState` / `populateUndoMenu`
 * (uxp_gui/cuemol2/base/content/cuemol2.js). Refresh triggers:
 *   - tab switch (`activeMolViewId` change): pull a fresh snapshot;
 *   - `SCE_SCENE_UNDOINFO` (fired by commitUndoTxn / clearUndoData) and any
 *     other scene event on the active scene: re-pull (debounced);
 *   - after an undo/redo we run here -- C++ `undo()`/`redo()` do NOT fire
 *     `SCE_SCENE_UNDOINFO`, so we must refresh explicitly (UXP does the same).
 *
 * `scene.undo(n)` undoes n+1 transactions, and `getUndoDesc(i)` has i=0 as the
 * most recent, so picking history entry `i` calls `pickUndo(i)`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC } from '@shared/ipcChannels'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { ActiveSceneCommandDeps } from '../commands/commandTypes'
import { CmdId } from '../commands/ids'
import { useRegisterCommand } from '../commands/CommandRegistry'
import { useCueMolEventListener } from './useCueMolEventListener'
import { SEM_SCENE, SEM_ANY } from '../event'

interface UseUndoRedoStateOptions {
  cm: AsyncCueMol | null
  activeMolViewId: number | undefined
  /** Returns the active scene/view ids; scene_uid drives all undo calls. */
  getActiveSceneInfo: ActiveSceneCommandDeps
}

export interface UndoRedoState {
  canUndo: boolean
  canRedo: boolean
  /** Undo transaction descriptions, index 0 = most recent (next undo). */
  undoDescs: string[]
  /** Redo transaction descriptions, index 0 = next redo. */
  redoDescs: string[]
  /** Undo `depth+1` transactions on the active scene, then refresh. */
  pickUndo: (depth?: number) => void
  /** Redo `depth+1` transactions on the active scene, then refresh. */
  pickRedo: (depth?: number) => void
}

const EMPTY: Pick<UndoRedoState, 'canUndo' | 'canRedo' | 'undoDescs' | 'redoDescs'> = {
  canUndo: false,
  canRedo: false,
  undoDescs: [],
  redoDescs: [],
}

export function useUndoRedoState({
  cm,
  activeMolViewId,
  getActiveSceneInfo,
}: UseUndoRedoStateOptions): UndoRedoState {
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [undoDescs, setUndoDescs] = useState<string[]>([])
  const [redoDescs, setRedoDescs] = useState<string[]>([])
  // Scene uid the event listener is scoped to; tracked as state so the
  // subscription resubscribes on tab switch.
  const [activeSceneId, setActiveSceneId] = useState<number | null>(null)

  // Stabilize getActiveSceneInfo so a fresh function identity per render does
  // not retrigger the tab-switch effect (same pattern as useActiveViewState).
  const getActiveSceneInfoRef = useRef(getActiveSceneInfo)
  getActiveSceneInfoRef.current = getActiveSceneInfo

  const syncNativeMenu = useCallback((u: boolean, r: boolean) => {
    window.electronAPI?.invoke(IPC.MENU_UPDATE_STATE, {
      undo: { enabled: u },
      redo: { enabled: r },
    }).catch((err: unknown) => {
      console.warn('update undo/redo menu state failed:', err)
    })
  }, [])

  const applyState = useCallback((s: typeof EMPTY) => {
    setCanUndo(s.canUndo)
    setCanRedo(s.canRedo)
    setUndoDescs(s.undoDescs)
    setRedoDescs(s.redoDescs)
    syncNativeMenu(s.canUndo, s.canRedo)
  }, [syncNativeMenu])

  const refresh = useCallback(async () => {
    const sceneId = getActiveSceneInfoRef.current()?.scene_uid
    if (!cm || sceneId === undefined) {
      applyState(EMPTY)
      return
    }
    try {
      const s = await cm.invokeService('getUndoState', { sceneId })
      applyState(s ?? EMPTY)
    } catch (err) {
      console.warn('getUndoState failed:', err)
      applyState(EMPTY)
    }
  }, [cm, applyState])

  const pickUndo = useCallback((depth = 0) => {
    const sceneId = getActiveSceneInfoRef.current()?.scene_uid
    if (!cm || sceneId === undefined) return
    cm.undo(sceneId, depth)
      .catch((e: unknown) => console.error('undo failed:', e))
      .finally(() => { void refresh() })
  }, [cm, refresh])

  const pickRedo = useCallback((depth = 0) => {
    const sceneId = getActiveSceneInfoRef.current()?.scene_uid
    if (!cm || sceneId === undefined) return
    cm.redo(sceneId, depth)
      .catch((e: unknown) => console.error('redo failed:', e))
      .finally(() => { void refresh() })
  }, [cm, refresh])

  const clearUndo = useCallback(() => {
    const sceneId = getActiveSceneInfoRef.current()?.scene_uid
    if (!cm || sceneId === undefined) return
    cm.invokeService('clearUndoData', { sceneId })
      .catch((e: unknown) => console.error('clearUndoData failed:', e))
      .finally(() => { void refresh() })
  }, [cm, refresh])

  // Menu Cmd+Z / Cmd+Shift+Z and the toolbar main buttons route here.
  useRegisterCommand(CmdId.Undo, () => { pickUndo(0) })
  useRegisterCommand(CmdId.Redo, () => { pickRedo(0) })
  // Edit > Clear undo data (UXP Qm2Main.clearUndoData). The explicit refresh
  // mirrors UXP updateCmdUndoState; the SCE_SCENE_UNDOINFO event also fires.
  useRegisterCommand(CmdId.ClearUndo, () => { clearUndo() })

  // Tab switch: rescope the listener and pull a fresh snapshot.
  useEffect(() => {
    const sceneId = cm && activeMolViewId !== undefined
      ? getActiveSceneInfoRef.current()?.scene_uid ?? null
      : null
    setActiveSceneId(sceneId)
    void refresh()
  }, [cm, activeMolViewId, refresh])

  // Refresh whenever the active scene changes (commit/clear fire
  // SCE_SCENE_UNDOINFO; scene load fires SCE_SCENE_ONLOADED) -- debounced.
  useCueMolEventListener({
    cm,
    enabled: cm !== null && activeSceneId !== null,
    category: '',
    srcMask: SEM_SCENE,
    evtMask: SEM_ANY,
    scopeId: activeSceneId ?? SEM_ANY,
    handler: () => { void refresh() },
    debounceMs: 50,
  })

  return { canUndo, canRedo, undoDescs, redoDescs, pickUndo, pickRedo }
}
