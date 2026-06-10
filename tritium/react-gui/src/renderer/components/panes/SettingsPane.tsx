/**
 * Tab content pane for "settings" tabs.
 *
 * VS Code–style settings pane with a left-side category tree
 * and a right-side scrollable settings list.
 *
 * ```
 * ┌─────────────────┬────────────────────────────────────────┐
 * │  🔍 Search...   │  🔍 Search...                          │
 * ├─────────────────┼────────────────────────────────────────┤
 * │ ▾ Display       │  THEME                                 │
 * │   Theme       ● │  Dark Mode                             │
 * │   Atom Labels   │  Switch between dark and light...  [⊙] │
 * │ ▾ Input         │                                        │
 * │ ▾ General       │                                        │
 * └─────────────────┴────────────────────────────────────────┘
 * ```
 *
 * Clicking a leaf node in the tree scrolls-to / filters the settings
 * panel on the right. Clicking a parent node expands or collapses it.
 *
 * The theme toggle is wired to `ThemeContext` for live switching and
 * electron-store persistence. Other values are mockup-only; real
 * persistence will be wired up when the backend config API is ready.
 *
 * The category tree, setting definitions, and default values live in
 * `settings/settingsConfig.ts`; the tree-row and setting-row widgets in
 * `settings/ConfigTreeNode.tsx` / `settings/SettingRow.tsx`.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { InputGroup } from '@blueprintjs/core'
import { AppIcon } from '../AppIcon'
import { useTheme } from '../../contexts/ThemeContext'
import { useRenderConfig } from '../../contexts/RenderConfigContext'
import { useCueMol } from '../../hooks/useCueMol'
import { ColorPickerProvider } from '../../h3-kit/colorpicker/ColorPickerContext'
import {
  CATEGORY_TREE,
  ALL_LEAF_IDS,
  SETTINGS,
  DEFAULTS,
  CATEGORY_LABELS,
  RENDER_BINARY_SETTING_KEYS,
} from './settings/settingsConfig'
import { ConfigTreeNode } from './settings/ConfigTreeNode'
import { SettingRow } from './settings/SettingRow'

export const SettingsPane: React.FC = () => {
  const { theme, setTheme } = useTheme()
  // Render binary paths are backed by RenderConfigContext (persistent),
  // not the mock `values` state.
  const { binaries, setBinary } = useRenderConfig()
  // App settings colours are scene-independent; `sceneId` is left undefined
  // so the colour picker resolves against the global StyleManager scope.
  const { cm } = useCueMol()

  const [filter, setFilter] = useState('')
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => ({
    ...DEFAULTS,
    // Initialise from the live theme context so the toggle matches reality.
    'display.darkMode': theme === 'dark',
  }))
  const [selectedCategory, setSelectedCategory] = useState(ALL_LEAF_IDS[0])

  /* All parent nodes start expanded. */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(CATEGORY_TREE.map((n) => n.id)),
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const handleChange = useCallback(
    (key: string, value: string | number | boolean) => {
      // Render binary paths persist via RenderConfigContext.
      const binaryKey = RENDER_BINARY_SETTING_KEYS[key]
      if (binaryKey) {
        setBinary(binaryKey, String(value))
        return
      }

      setValues((prev) => ({ ...prev, [key]: value }))

      // Sync theme toggle with the ThemeContext.
      if (key === 'display.darkMode') {
        setTheme(value ? 'dark' : 'light')
      }
    },
    [setTheme, setBinary],
  )

  // Keep the toggle in sync if theme changes externally.
  useEffect(() => {
    setValues((prev) => {
      const isDark = theme === 'dark'
      if (prev['display.darkMode'] === isDark) return prev
      return { ...prev, 'display.darkMode': isDark }
    })
  }, [theme])

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /** Settings filtered by the search query. */
  const filtered = useMemo(() => {
    if (!filter.trim()) return SETTINGS
    const q = filter.toLowerCase()
    return SETTINGS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q),
    )
  }, [filter])

  /** Per-category setting count (for tree badges). */
  const settingsCount = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of filtered) {
      counts[s.category] = (counts[s.category] ?? 0) + 1
    }
    return counts
  }, [filtered])

  /** Leaf categories that have at least one visible setting. */
  const visibleLeaves = useMemo(
    () => ALL_LEAF_IDS.filter((id) => filtered.some((s) => s.category === id)),
    [filtered],
  )

  /** When searching, show all matching categories. Otherwise only the selected one. */
  const displayLeaves = filter.trim() ? visibleLeaves : visibleLeaves.filter((id) => id === selectedCategory)

  /** Select a category from the tree and scroll to it. */
  const handleCategorySelect = useCallback(
    (id: string) => {
      setSelectedCategory(id)
      if (!filter.trim()) {
        // When not searching, scroll is instant because we only show one category.
        scrollRef.current?.scrollTo({ top: 0 })
      } else {
        // When searching, scroll to the section header.
        const el = sectionRefs.current[id]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
    [filter],
  )

  /* Highlight the tree node that corresponds to the category currently
     scrolled into view when in search mode. */
  const handleScroll = useCallback(() => {
    if (!filter.trim() || !scrollRef.current) return
    const container = scrollRef.current
    const top = container.scrollTop + 8
    for (const id of visibleLeaves) {
      const el = sectionRefs.current[id]
      if (el && el.offsetTop <= top && el.offsetTop + el.offsetHeight > top) {
        setSelectedCategory(id)
        break
      }
    }
  }, [filter, visibleLeaves])

  const matchCount = filtered.length

  return (
    <ColorPickerProvider cm={cm} sceneId={undefined}>
    <div className="config-pane">
      {/* ── Left: category tree ── */}
      <div className="config-tree-panel">
        <div className="config-tree-header">
          <AppIcon name="ui.settings" size="md" className="config-tree-header-icon" aria-hidden />
          <span className="config-tree-header-title">Settings</span>
        </div>
        <div className="config-tree-scroll">
          {CATEGORY_TREE.map((node) => (
            <ConfigTreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedCategory}
              onSelect={handleCategorySelect}
              settingsCount={settingsCount}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
            />
          ))}
        </div>
      </div>

      {/* ── Right: settings list ── */}
      <div className="config-content-panel">
        {/* Search bar */}
        <div className="config-search-bar">
          <InputGroup
            className="config-search-input"
            leftIcon={<AppIcon name="ui.search" aria-hidden />}
            placeholder="Search settings…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            rightElement={
              filter ? (
                <button
                  className="config-search-clear bp5-button bp5-minimal bp5-small"
                  onClick={() => setFilter('')}
                >
                  <AppIcon name="ui.close" size="md" aria-hidden />
                </button>
              ) : undefined
            }
          />
          {filter && (
            <span className="config-search-count">
              {matchCount} {matchCount === 1 ? 'setting' : 'settings'}
            </span>
          )}
        </div>

        {/* Settings body */}
        <div className="config-scroll" ref={scrollRef} onScroll={handleScroll}>
          {displayLeaves.map((catId) => (
            <div
              key={catId}
              className="config-category"
              ref={(el) => { sectionRefs.current[catId] = el }}
            >
              <div className="config-category-header">
                {CATEGORY_LABELS[catId] ?? catId}
              </div>
              {filtered
                .filter((s) => s.category === catId)
                .map((s) => {
                  const binaryKey = RENDER_BINARY_SETTING_KEYS[s.key]
                  return (
                    <SettingRow
                      key={s.key}
                      def={s}
                      value={binaryKey ? binaries[binaryKey] : values[s.key]}
                      onChange={handleChange}
                    />
                  )
                })}
            </div>
          ))}

          {displayLeaves.length === 0 && (
            <div className="config-no-results">
              <AppIcon name="ui.search" size={32} className="config-no-results-icon" aria-hidden />
              <span>No settings match "{filter}"</span>
            </div>
          )}
        </div>
      </div>
    </div>
    </ColorPickerProvider>
  )
}
