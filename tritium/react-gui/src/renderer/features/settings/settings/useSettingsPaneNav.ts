/**
 * @file features/settings/settings/useSettingsPaneNav.ts
 * @description In-session (non-persistent) memory for the SettingsPane's
 * navigation state -- the selected category, search filter, and expanded
 * groups -- so switching away from the Settings tab and back does not reset
 * which item is being configured.
 *
 * Backed by a module-level store by design: ContentPane renders only the active
 * tab, so SettingsPane unmounts on a tab switch and remounts fresh on return;
 * plain `useState` would reset. The store survives that unmount and resets on a
 * full reload / app restart. This is deliberately NOT persisted to
 * electron-store -- same-session only. The Settings tab is a singleton
 * (`SETTINGS_TAB_ID`), so a single shared store is safe.
 */

import { useEffect, useState, useCallback } from 'react'
import { ALL_LEAF_IDS, CATEGORY_TREE } from './settingsConfig'

interface SettingsPaneNavStore {
  selectedCategory: string
  filter: string
  /** null = not yet touched -> fall back to "all top-level groups expanded". */
  expandedIds: string[] | null
}

const store: SettingsPaneNavStore = {
  selectedCategory: ALL_LEAF_IDS[0] ?? '',
  filter: '',
  expandedIds: null,
}

/** Default expanded set: every top-level group open. */
function defaultExpanded(): Set<string> {
  return new Set(CATEGORY_TREE.map((n) => n.id))
}

export interface SettingsPaneNav {
  selectedCategory: string
  setSelectedCategory: (id: string) => void
  filter: string
  setFilter: (f: string) => void
  expandedIds: Set<string>
  toggleExpand: (id: string) => void
}

/**
 * SettingsPane navigation state that persists across the pane's unmount/remount
 * within a session (see file header).
 */
export function useSettingsPaneNav(): SettingsPaneNav {
  const [selectedCategory, setSelectedCategory] = useState<string>(() => store.selectedCategory)
  const [filter, setFilter] = useState<string>(() => store.filter)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    store.expandedIds ? new Set(store.expandedIds) : defaultExpanded(),
  )

  // Mirror each change into the module store so the next mount restores it.
  useEffect(() => {
    store.selectedCategory = selectedCategory
  }, [selectedCategory])
  useEffect(() => {
    store.filter = filter
  }, [filter])
  useEffect(() => {
    store.expandedIds = Array.from(expandedIds)
  }, [expandedIds])

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return {
    selectedCategory,
    setSelectedCategory,
    filter,
    setFilter,
    expandedIds,
    toggleExpand,
  }
}
