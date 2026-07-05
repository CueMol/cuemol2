/**
 * Pins that SettingsPane navigation state (selected category / filter / expanded
 * groups) survives the pane's unmount+remount within a session -- the fix for
 * "the settings pane resets which item is selected when you switch tabs and
 * come back". A fresh hook instance (== a remount) must read back the value the
 * previous instance left.
 */

import { describe, it, expect } from 'vitest'
import { act } from 'react'
import { makeRenderHook } from './helpers/testHarness'
import { useSettingsPaneNav } from '../components/panes/settings/useSettingsPaneNav'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

describe('useSettingsPaneNav (in-session persistence across remount)', () => {
  it('restores the selected category', () => {
    const h1 = makeRenderHook(() => useSettingsPaneNav())
    act(() => h1.result.setSelectedCategory('input.mouse'))
    expect(h1.result.selectedCategory).toBe('input.mouse')
    h1.unmount()

    const h2 = makeRenderHook(() => useSettingsPaneNav())
    expect(h2.result.selectedCategory).toBe('input.mouse')
    h2.unmount()
  })

  it('restores the search filter', () => {
    const h1 = makeRenderHook(() => useSettingsPaneNav())
    act(() => h1.result.setFilter('font'))
    h1.unmount()

    const h2 = makeRenderHook(() => useSettingsPaneNav())
    expect(h2.result.filter).toBe('font')
    h2.unmount()
  })

  it('restores expanded/collapsed groups', () => {
    const h1 = makeRenderHook(() => useSettingsPaneNav())
    act(() => h1.result.toggleExpand('display'))
    const afterToggle = h1.result.expandedIds.has('display')
    h1.unmount()

    const h2 = makeRenderHook(() => useSettingsPaneNav())
    expect(h2.result.expandedIds.has('display')).toBe(afterToggle)
    h2.unmount()
  })
})
