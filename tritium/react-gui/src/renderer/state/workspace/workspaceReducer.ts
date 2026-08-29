/**
 * @file state/workspace/workspaceReducer.ts
 * @description The editor tab strip as a pure reducer.
 *
 * One record per tab, one active id. A molview tab carries both its view and
 * its scene, so "the active scene" and "the active view" are two readings of
 * the same record and can never disagree by a render (they used to live in
 * two stores that resolved one render apart -- B10 -- and the second store's
 * copy of the title was frozen at creation -- B11).
 *
 * Every transition returns the SAME state object when nothing changes, so a
 * no-op dispatch does not re-render subscribers.
 */

import type { TabData } from '../../types'

/** Well-known id of the singleton Settings tab. */
export const SETTINGS_TAB_ID = '__settings__'

export interface WorkspaceState {
  tabs: TabData[]
  /** Id of the visible tab; '' when no tab is open. */
  activeTabId: string
}

export const INITIAL_WORKSPACE: WorkspaceState = { tabs: [], activeTabId: '' }

export type WorkspaceAction =
  | { type: 'openMolView'; title: string; viewId: number; sceneId: number }
  | { type: 'openSettings' }
  | { type: 'activate'; id: string }
  | { type: 'activateView'; viewId: number }
  | { type: 'close'; id: string }
  | { type: 'reorder'; fromId: string; toId: string; insertAfter: boolean }
  | { type: 'setMolViewTitle'; viewId: number; title: string }

/** Tab id for a view: view uids are unique C++ uids, so this is too. */
export function molViewTabId(viewId: number): string {
  return `molview-${viewId}`
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'openMolView': {
      const id = molViewTabId(action.viewId)
      if (state.tabs.some((t) => t.id === id)) {
        return state.activeTabId === id ? state : { ...state, activeTabId: id }
      }
      const tab: TabData = {
        id,
        title: action.title,
        icon: 'file.molview',
        type: 'molview',
        viewId: action.viewId,
        sceneId: action.sceneId,
      }
      return { tabs: [...state.tabs, tab], activeTabId: id }
    }

    case 'openSettings': {
      if (state.tabs.some((t) => t.id === SETTINGS_TAB_ID)) {
        return state.activeTabId === SETTINGS_TAB_ID
          ? state
          : { ...state, activeTabId: SETTINGS_TAB_ID }
      }
      const tab: TabData = {
        id: SETTINGS_TAB_ID,
        title: 'Settings',
        icon: 'file.settings',
        type: 'settings',
      }
      return { tabs: [...state.tabs, tab], activeTabId: SETTINGS_TAB_ID }
    }

    case 'activate': {
      if (state.activeTabId === action.id) return state
      if (!state.tabs.some((t) => t.id === action.id)) return state
      return { ...state, activeTabId: action.id }
    }

    case 'activateView': {
      // Resolved against the current list, so a view whose tab was removed a
      // moment ago (the window-close sweep) is a safe no-op.
      const tab = state.tabs.find((t) => t.type === 'molview' && t.viewId === action.viewId)
      if (!tab || state.activeTabId === tab.id) return state
      return { ...state, activeTabId: tab.id }
    }

    case 'close': {
      const index = state.tabs.findIndex((t) => t.id === action.id)
      if (index < 0) return state
      const tabs = state.tabs.filter((t) => t.id !== action.id)
      const activeTabId =
        state.activeTabId === action.id
          ? tabs.length > 0
            ? tabs[tabs.length - 1].id
            : ''
          : state.activeTabId
      return { tabs, activeTabId }
    }

    case 'reorder': {
      if (action.fromId === action.toId) return state
      const fromIndex = state.tabs.findIndex((t) => t.id === action.fromId)
      const toIndex = state.tabs.findIndex((t) => t.id === action.toId)
      if (fromIndex === -1 || toIndex === -1) return state
      const tabs = [...state.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      let insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
      if (action.insertAfter) insertIndex += 1
      tabs.splice(insertIndex, 0, moved)
      return { ...state, tabs }
    }

    case 'setMolViewTitle': {
      let changed = false
      const tabs = state.tabs.map((t) => {
        if (t.type === 'molview' && t.viewId === action.viewId && t.title !== action.title) {
          changed = true
          return { ...t, title: action.title }
        }
        return t
      })
      return changed ? { ...state, tabs } : state
    }
  }
}

// --- Selectors ---

export function activeTabOf(state: WorkspaceState): TabData | undefined {
  return state.tabs.find((t) => t.id === state.activeTabId)
}

/**
 * The active molview's ids, or undefined when the visible tab is not a
 * molview (Settings, or nothing open). Both ids come from one record.
 */
export function activeMolViewOf(
  state: WorkspaceState,
): { viewId: number; sceneId: number } | undefined {
  const tab = activeTabOf(state)
  if (tab?.type !== 'molview' || tab.viewId === undefined || tab.sceneId === undefined) {
    return undefined
  }
  return { viewId: tab.viewId, sceneId: tab.sceneId }
}

/** Open molview tabs in strip order. */
export function molViewTabsOf(tabs: readonly TabData[]): TabData[] {
  return tabs.filter((t) => t.type === 'molview' && t.viewId !== undefined)
}
