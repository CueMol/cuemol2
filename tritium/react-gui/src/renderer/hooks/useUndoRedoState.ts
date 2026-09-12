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
 *   - active scene change (`activeSceneId`): pull a fresh snapshot and
 *     re-scope the event listener;
 *   - `SCE_SCENE_UNDOINFO` (fired by commitUndoTxn / clearUndoData) and any
 *     other scene event on the active scene: re-pull (debounced);
 *   - after an undo/redo we run here -- C++ `undo()`/`redo()` do NOT fire
 *     `SCE_SCENE_UNDOINFO`, so we must refresh explicitly (UXP does the same);
 *   - the undo/redo lock being taken or released (`UndoRedoLockContext`),
 *     which forces both flags false without touching the scene.
 *
 * The scene uid is taken from the reactive `activeSceneId` prop, never read
 * back through a callback at effect time: the molview tab list resolves the
 * new scene one render after the tab changes, so keying on the tab and
 * reading the scene through a ref scoped the listener (and the snapshot) to
 * the PREVIOUS scene. Edits on the new tab then never refreshed the state
 * and Undo / Redo stayed disabled until the next tab switch.
 *
 * `scene.undo(n)` undoes n+1 transactions, and `getUndoDesc(i)` has i=0 as the
 * most recent, so picking history entry `i` calls `pickUndo(i)`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IPC } from '@shared/ipcChannels'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import { CmdId } from '@renderer/commands/ids'
import { useRegisterCommand } from '@renderer/commands/CommandRegistry'
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener'
import { SEM_SCENE, SEM_ANY } from '@renderer/event'
import { EVENT_BURST_DEBOUNCE_MS } from '@renderer/utils/timing'
import { useLatestRef } from '@renderer/hooks/react/useLatestRef'
import { useUndoRedoLocked } from '@renderer/contexts/UndoRedoLockContext'

interface UseUndoRedoStateOptions {
  cm: AsyncCueMol | null
  /**
   * Uid of the scene shown by the active molview tab; undefined when no
   * molview tab is active. Drives every undo call and the listener scope.
   */
  activeSceneId: number | undefined
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
  activeSceneId,
}: UseUndoRedoStateOptions): UndoRedoState {
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [undoDescs, setUndoDescs] = useState<string[]>([])
  const [redoDescs, setRedoDescs] = useState<string[]>([])

  // Latest scene for the imperative callbacks (undo / redo / clear / refresh)
  // without giving them a new identity per scene.
  const sceneIdRef = useLatestRef(activeSceneId)

  // While something holds the lock (a plugin running a multi-step edit inside
  // one transaction), undo / redo are reported and treated as unavailable.
  // The last snapshot is kept so the flags can be restored on release without
  // another round-trip.
  const locked = useUndoRedoLocked()
  const lockedRef = useLatestRef(locked)
  const rawRef = useRef<typeof EMPTY>(EMPTY)

  const syncNativeMenu = useCallback((u: boolean, r: boolean) => {
    window.electronAPI?.invoke(IPC.MENU_UPDATE_STATE, {
      undo: { enabled: u },
      redo: { enabled: r },
    }).catch((err: unknown) => {
      console.warn('update undo/redo menu state failed:', err)
    })
  }, [])

  const applyState = useCallback((s: typeof EMPTY) => {
    rawRef.current = s
    const u = s.canUndo && !lockedRef.current
    const r = s.canRedo && !lockedRef.current
    setCanUndo(u)
    setCanRedo(r)
    setUndoDescs(s.undoDescs)
    setRedoDescs(s.redoDescs)
    syncNativeMenu(u, r)
  }, [syncNativeMenu, lockedRef])

  // Taking or releasing the lock changes the answer without any scene event,
  // so re-derive from the last snapshot; this is what re-pushes the native
  // menu's enabled flags on both edges.
  useEffect(() => {
    applyState(rawRef.current)
  }, [locked, applyState])

  const refresh = useCallback(async () => {
    const sceneId = sceneIdRef.current
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
  }, [cm, applyState, sceneIdRef])

  // The single choke point for running an undo: the Edit menu, Cmd+Z, the
  // toolbar button and the history dropdown all arrive here.
  const pickUndo = useCallback((depth = 0) => {
    const sceneId = sceneIdRef.current
    if (!cm || sceneId === undefined || lockedRef.current) return
    cm.undo(sceneId, depth)
      .catch((e: unknown) => console.error('undo failed:', e))
      .finally(() => { void refresh() })
  }, [cm, refresh, sceneIdRef, lockedRef])

  const pickRedo = useCallback((depth = 0) => {
    const sceneId = sceneIdRef.current
    if (!cm || sceneId === undefined || lockedRef.current) return
    cm.redo(sceneId, depth)
      .catch((e: unknown) => console.error('redo failed:', e))
      .finally(() => { void refresh() })
  }, [cm, refresh, sceneIdRef, lockedRef])

  const clearUndo = useCallback(() => {
    const sceneId = sceneIdRef.current
    if (!cm || sceneId === undefined) return
    cm.invokeService('clearUndoData', { sceneId })
      .catch((e: unknown) => console.error('clearUndoData failed:', e))
      .finally(() => { void refresh() })
  }, [cm, refresh, sceneIdRef])

  // Menu Cmd+Z / Cmd+Shift+Z and the toolbar main buttons route here.
  useRegisterCommand(CmdId.Undo, () => { pickUndo(0) })
  useRegisterCommand(CmdId.Redo, () => { pickRedo(0) })
  // Edit > Clear undo data (UXP Qm2Main.clearUndoData). The explicit refresh
  // mirrors UXP updateCmdUndoState; the SCE_SCENE_UNDOINFO event also fires.
  useRegisterCommand(CmdId.ClearUndo, () => { clearUndo() })

  // Active scene change (tab switch, tab close, scene load): pull a fresh
  // snapshot. The listener below re-scopes through the same dep.
  useEffect(() => {
    void refresh()
  }, [cm, activeSceneId, refresh])

  // Refresh whenever the active scene changes (commit/clear fire
  // SCE_SCENE_UNDOINFO; scene load fires SCE_SCENE_ONLOADED) -- debounced.
  useCueMolEventListener({
    cm,
    enabled: cm !== null && activeSceneId !== undefined,
    category: '',
    srcMask: SEM_SCENE,
    evtMask: SEM_ANY,
    scopeId: activeSceneId ?? SEM_ANY,
    handler: () => { void refresh() },
    debounceMs: EVENT_BURST_DEBOUNCE_MS,
  })

  // Memoized: UndoRedoProvider hands this straight to its context, and the
  // toolbar is memo'd against it.
  return useMemo(
    () => ({ canUndo, canRedo, undoDescs, redoDescs, pickUndo, pickRedo }),
    [canUndo, canRedo, undoDescs, redoDescs, pickUndo, pickRedo],
  )
}
