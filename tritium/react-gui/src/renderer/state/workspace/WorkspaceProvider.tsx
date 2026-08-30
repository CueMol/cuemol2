/**
 * @file state/workspace/WorkspaceProvider.tsx
 * @description Owner of the editor tab strip and of what "the active scene"
 * means.
 *
 * Replaces two stores that used to describe the same thing -- the tab strip
 * (App-local `useTabManager`) and the molview registry (`MolTabProvider`) --
 * plus the effect that kept them in step. With one record per tab the active
 * scene and the active view are read off the same record in the same render;
 * they can no longer disagree for a frame, and a rename reaches every reader
 * because there is only one title.
 *
 * The provider also owns the two side effects that belong to a tab's
 * lifetime: activating the worker view for the visible molview, and tearing
 * the view down when its tab closes (after the save prompt). Both used to be
 * App's, wired by hand; keeping them here is what makes "closing a tab calls
 * cm.removeView exactly once" something a test can pin.
 *
 * Three contexts, so a subscriber pays only for what it reads:
 *   - WorkspaceDispatch  stable for the provider's lifetime; never re-renders
 *   - WorkspaceTabs      the strip (tabs, active id) -- TabBar, ContentArea
 *   - ActiveScene        the active scene / view ids -- every pane and panel;
 *                        changes only when the scene or view actually changes,
 *                        not on rename / reorder / Settings-tab churn
 *
 * Sits below DialogProvider and CommandProvider (the close confirm needs
 * both) and above App.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import type { TabData } from '@renderer/types'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useMolViewTabTitleSync } from '@renderer/hooks/useMolViewTabTitleSync'
import { useConfirmCloseTab } from './useConfirmCloseTab'
import {
  INITIAL_WORKSPACE,
  activeMolViewOf,
  activeTabOf,
  molViewTabsOf,
  workspaceReducer,
  type WorkspaceState,
} from './workspaceReducer'

// --- Context shapes ---

export interface WorkspaceDispatch {
  /** Open (or re-activate) the tab for a molview. */
  openMolViewTab: (title: string, viewId: number, sceneId: number) => void
  /** Open the singleton Settings tab, or activate it when already open. */
  openSettingsTab: () => void
  activateTab: (id: string) => void
  /** Activate the tab showing `viewId`; a no-op when no tab does. */
  activateView: (viewId: number) => void
  /**
   * Close a tab after its save prompt. Resolves true when the tab closed,
   * false when the user kept it. A molview's worker view is removed on close.
   */
  closeTab: (id: string) => Promise<boolean>
  reorderTabs: (fromId: string, toId: string, insertAfter?: boolean) => void
  setMolViewTitle: (viewId: number, title: string) => void
  /** Ref reads for imperative code that must not re-render on tab churn. */
  getActiveTabId: () => string
  getActiveViewId: () => number | undefined
  getActiveSceneInfo: () => { scene_uid: number; view_id: number } | undefined
  tabsRef: React.RefObject<TabData[]>
}

/** One open molview, as older consumers name it. */
export interface MolViewEntry {
  view_id: number
  scene_uid: number
  title: string
}

export interface WorkspaceTabs {
  tabs: TabData[]
  activeTabId: string
  activeTab: TabData | undefined
  /** The molview tabs in strip order, with their LIVE titles. */
  molViewEntries: MolViewEntry[]
}

export interface ActiveScene {
  /** Scene of the visible molview tab; undefined for Settings / no tab. */
  activeSceneId: number | undefined
  /** View of the visible molview tab; undefined for Settings / no tab. */
  activeMolViewId: number | undefined
  hasScene: boolean
}

const DispatchContext = createContext<WorkspaceDispatch | null>(null)
const TabsContext = createContext<WorkspaceTabs | null>(null)
const ActiveSceneContext = createContext<ActiveScene | null>(null)

function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} must be used inside WorkspaceProvider`)
  return value
}

export function useWorkspaceDispatch(): WorkspaceDispatch {
  return required(useContext(DispatchContext), 'useWorkspaceDispatch')
}
export function useWorkspaceTabs(): WorkspaceTabs {
  return required(useContext(TabsContext), 'useWorkspaceTabs')
}
export function useActiveScene(): ActiveScene {
  return required(useContext(ActiveSceneContext), 'useActiveScene')
}

// --- Provider ---

export function WorkspaceProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { cm, cueMolReady } = useCueMol()
  const [state, dispatch] = useReducer(workspaceReducer, INITIAL_WORKSPACE)

  // Latest state for the ref readers and the async close, without giving the
  // dispatch callbacks a dependency on it.
  const stateRef = useRef<WorkspaceState>(state)
  stateRef.current = state
  const tabsRef = useRef<TabData[]>(state.tabs)
  tabsRef.current = state.tabs
  const cmRef = useRef(cm)
  cmRef.current = cm
  const confirmCloseTab = useConfirmCloseTab(cm)
  const confirmRef = useRef(confirmCloseTab)
  confirmRef.current = confirmCloseTab

  const closeTab = useCallback(async (id: string): Promise<boolean> => {
    const closing = stateRef.current.tabs.find((t) => t.id === id)
    if (!closing) return false
    if (closing.type === 'molview' && closing.viewId !== undefined) {
      const proceed = await confirmRef.current(closing.viewId)
      if (!proceed) return false
    }
    // Re-read after the (possibly slow) prompt: the strip may have shifted.
    const tab = stateRef.current.tabs.find((t) => t.id === id)
    if (!tab) return false
    // Tear the worker side down first -- stop its animation, release its GL
    // resources, destroy the scene -- and only then drop the tab record. The
    // record going first would let the UI move on (activate another view,
    // open a new scene) while the old one was still being dismantled. This is
    // the only place a view is removed, so a closed tab never leaves anything
    // running behind it.
    if (tab.type === 'molview' && tab.viewId !== undefined) {
      try {
        await cmRef.current?.removeView(tab.viewId)
      } catch (err: unknown) {
        console.warn('removeView failed:', err)
      }
    }
    dispatch({ type: 'close', id })
    return true
  }, [])

  const dispatchValue = useMemo<WorkspaceDispatch>(
    () => ({
      openMolViewTab: (title, viewId, sceneId) =>
        dispatch({ type: 'openMolView', title, viewId, sceneId }),
      openSettingsTab: () => dispatch({ type: 'openSettings' }),
      activateTab: (id) => dispatch({ type: 'activate', id }),
      activateView: (viewId) => dispatch({ type: 'activateView', viewId }),
      closeTab,
      reorderTabs: (fromId, toId, insertAfter = false) =>
        dispatch({ type: 'reorder', fromId, toId, insertAfter }),
      setMolViewTitle: (viewId, title) => dispatch({ type: 'setMolViewTitle', viewId, title }),
      getActiveTabId: () => stateRef.current.activeTabId,
      getActiveViewId: () => activeMolViewOf(stateRef.current)?.viewId,
      getActiveSceneInfo: () => {
        const active = activeMolViewOf(stateRef.current)
        return active ? { scene_uid: active.sceneId, view_id: active.viewId } : undefined
      },
      tabsRef,
    }),
    [closeTab],
  )

  const tabsValue = useMemo<WorkspaceTabs>(
    () => ({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      activeTab: activeTabOf(state),
      molViewEntries: molViewTabsOf(state.tabs).map((t) => ({
        view_id: t.viewId as number,
        scene_uid: t.sceneId as number,
        title: t.title,
      })),
    }),
    [state],
  )

  const active = activeMolViewOf(state)
  const activeSceneId = active?.sceneId
  const activeMolViewId = active?.viewId
  const activeValue = useMemo<ActiveScene>(
    () => ({ activeSceneId, activeMolViewId, hasScene: activeMolViewId !== undefined }),
    [activeSceneId, activeMolViewId],
  )

  // The worker follows the visible molview. `activateView` is idempotent on
  // the worker side, so this fires only when the view actually changes.
  useEffect(() => {
    if (!cm || !cueMolReady || activeMolViewId === undefined) return
    cm.activateView(activeMolViewId).catch((err: unknown) => {
      console.warn('activateView failed:', err)
    })
  }, [cm, cueMolReady, activeMolViewId])

  // A scene rename (Explorer, script, undo) rewrites the tab title; the
  // entries are derived from the strip so the mapping can never go stale.
  useMolViewTabTitleSync({
    cm,
    molTabEntries: tabsValue.molViewEntries,
    updateMolViewTabTitle: dispatchValue.setMolViewTitle,
  })

  return (
    <DispatchContext.Provider value={dispatchValue}>
      <TabsContext.Provider value={tabsValue}>
        <ActiveSceneContext.Provider value={activeValue}>{children}</ActiveSceneContext.Provider>
      </TabsContext.Provider>
    </DispatchContext.Provider>
  )
}
