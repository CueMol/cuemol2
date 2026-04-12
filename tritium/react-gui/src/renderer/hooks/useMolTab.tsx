import React, { useState, useContext, useCallback, useMemo, useRef } from 'react'

/** A single tab entry representing one CueMol view panel. */
interface MolTabEntry {
  title: string
  view_id: number
  scene_uid: number
  bound: boolean
  active: boolean
}

/**
 * Stable dispatch functions for the MolTab subsystem.
 * These callbacks have empty dependency arrays, so their identities never
 * change across renders. Components that only need to mutate state (e.g.
 * MolView) should consume this context via `useMolTabDispatch` to avoid
 * re-renders triggered by unrelated state changes.
 */
interface MolTabDispatch {
  addMolTab: (title: string, view_id: number, scene_uid: number, bound?: boolean) => void
  removeMolTab: (view_id: number) => void
  setActiveTab: (ind: number) => void
  setActiveViewByID: (view_id: number) => void
  getActiveViewID: () => number | undefined
  getActiveSceneInfo: () => { scene_uid: number; view_id: number } | undefined
}

/**
 * Reactive state for the MolTab subsystem.
 * Changes whenever a tab is added/removed or the active tab changes.
 * Components that render based on tab state should consume this context
 * via `useMolTabState`.
 */
interface MolTabState {
  activeViewID: number | null
  molTabEntries: MolTabEntry[]
}

/**
 * Two separate React contexts are used instead of one to allow fine-grained
 * subscription:
 *   - MolTabDispatchContext — stable; never triggers re-renders on its own
 *   - MolTabStateContext    — changes with tab list / active view
 *
 * This prevents the WebGL canvas (MolView) from re-rendering every time the
 * tab list is updated, which would cause visual artifacts.
 */
const MolTabDispatchContext = React.createContext<MolTabDispatch | null>(null)
const MolTabStateContext = React.createContext<MolTabState | null>(null)

/**
 * Hook for components that only need stable dispatch functions (e.g. MolView).
 * Subscribing here does NOT cause re-renders when tab state changes.
 */
export function useMolTabDispatch(): MolTabDispatch {
  const ctx = useContext(MolTabDispatchContext)
  if (!ctx) throw new Error('useMolTabDispatch must be used inside MolTabProvider')
  return ctx
}

/**
 * Hook for components that need reactive state (e.g. TabMolView, SidePanel).
 * Re-renders whenever `activeViewID` or `molTabEntries` changes.
 */
export function useMolTabState(): MolTabState {
  const ctx = useContext(MolTabStateContext)
  if (!ctx) throw new Error('useMolTabState must be used inside MolTabProvider')
  return ctx
}

/**
 * Convenience hook for components that need both dispatch and state.
 * Equivalent to spreading both `useMolTabDispatch()` and `useMolTabState()`.
 */
export function useMolTab(): MolTabDispatch & MolTabState {
  return { ...useMolTabDispatch(), ...useMolTabState() }
}

/** Context provider that owns all MolTab state. */
export function MolTabProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [activeViewID, setActiveViewID] = useState<number | null>(null)
  const [molTabEntries, setMolTabEntries] = useState<MolTabEntry[]>([])

  // Mirror of molTabEntries kept in a ref so that `getActiveViewID` can read the
  // latest value without being listed as a dependency (which would change its
  // identity on every tab update and propagate re-renders to consumers).
  const entriesRef = useRef(molTabEntries)
  entriesRef.current = molTabEntries

  const addMolTab = useCallback((title: string, view_id: number, scene_uid: number, bound = false): void => {
    setMolTabEntries((entries) => [
      ...entries.map((x) => ({ ...x, active: false })),
      { title, view_id, scene_uid, bound, active: true },
    ])
    setActiveViewID(view_id)
  }, [])

  const removeMolTab = useCallback((view_id: number): void => {
    setMolTabEntries((entries) => entries.filter((x) => x.view_id !== view_id))
  }, [])

  const setActiveTab = useCallback((ind: number): void => {
    setMolTabEntries((entries) => {
      if (entries.length <= ind) throw Error(`tab index ${entries.length} <= ${ind}`)
      const view_id = entries[ind].view_id
      setActiveViewID(view_id)
      return entries.map((x, i) => ({ ...x, active: i === ind }))
    })
  }, [])

  /**
   * Returns the view_id of the currently active tab.
   * Reads from `entriesRef` (not the state variable) so that the callback
   * identity is stable — no dependency on `molTabEntries`.
   */
  const getActiveViewID = useCallback((): number | undefined => {
    return entriesRef.current.find((x) => x.active)?.view_id
  }, [])

  const getActiveSceneInfo = useCallback((): { scene_uid: number; view_id: number } | undefined => {
    const entry = entriesRef.current.find((x) => x.active)
    if (!entry) return undefined
    return { scene_uid: entry.scene_uid, view_id: entry.view_id }
  }, [])

  /**
   * Activate the tab whose view_id matches. No-op if not found.
   * Identity is stable — reads from entriesRef, no dependency on state.
   */
  const setActiveViewByID = useCallback((view_id: number): void => {
    const ind = entriesRef.current.findIndex((x) => x.view_id === view_id)
    if (ind !== -1) setActiveTab(ind)
  }, [setActiveTab])

  // Dispatch context value is stable (all callbacks have empty deps)
  const dispatch = useMemo<MolTabDispatch>(
    () => ({ addMolTab, removeMolTab, setActiveTab, setActiveViewByID, getActiveViewID, getActiveSceneInfo }),
    [addMolTab, removeMolTab, setActiveTab, setActiveViewByID, getActiveViewID, getActiveSceneInfo]
  )

  // State context value changes only when state actually changes
  const state = useMemo<MolTabState>(
    () => ({ activeViewID, molTabEntries }),
    [activeViewID, molTabEntries]
  )

  return (
    <MolTabDispatchContext.Provider value={dispatch}>
      <MolTabStateContext.Provider value={state}>
        {children}
      </MolTabStateContext.Provider>
    </MolTabDispatchContext.Provider>
  )
}
