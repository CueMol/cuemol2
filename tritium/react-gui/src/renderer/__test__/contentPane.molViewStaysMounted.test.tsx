/**
 * @file __test__/contentPane.molViewStaysMounted.test.tsx
 * @description The one mount invariant the WebGL canvas depends on.
 *
 * `transferControlToOffscreen()` is one-shot and the worker has no unbind
 * path, so MolViewPane must never unmount once it has mounted -- not when the
 * user switches to Settings, and not when every molview tab is closed. The
 * workspace refactor moved tab ownership; this pins that ContentPane still
 * keeps the pane alive off its own memory of having seen a molview.
 */

import { describe, it, expect, vi } from 'vitest'
import React, { useEffect } from 'react'
import { act } from 'react'
import type { TabData } from '../types'
import { mountTree } from './helpers/testHarness'

void React

const counters = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }))

vi.mock('../components/panes/MolViewPane', () => ({
  MolViewPane: () => {
    useEffect(() => {
      counters.mounts += 1
      return () => { counters.unmounts += 1 }
    }, [])
    return <div data-testid="molview" />
  },
}))
vi.mock('../components/panes/SettingsPane', () => ({ SettingsPane: () => <div data-testid="settings" /> }))
vi.mock('../components/panes/WelcomePane', () => ({ WelcomePane: () => <div data-testid="welcome" /> }))
vi.mock('../components/ViewportToolPalette', () => ({ ViewportToolPalette: () => null }))
vi.mock('../components/RectSelectOverlay', () => ({ RectSelectOverlay: () => null }))
vi.mock('../hooks/useNaviClickHandler', () => ({ useNaviClickHandler: () => undefined }))
vi.mock('../hooks/useMeasureClickHandler', () => ({ useMeasureClickHandler: () => undefined }))
vi.mock('../hooks/useBondEditClickHandler', () => ({ useBondEditClickHandler: () => undefined }))
vi.mock('../hooks/useNaviContextMenu', () => ({
  useNaviContextMenu: () => ({ openContextMenu: () => undefined }),
}))

import { ContentPane } from '../components/panes/ContentPane'

const molTab: TabData = { id: 'molview-10', title: 'A:0', icon: 'file.molview', type: 'molview', viewId: 10, sceneId: 100 }
const settingsTab: TabData = { id: '__settings__', title: 'Settings', icon: 'file.settings', type: 'settings' }

function render(tabs: TabData[], active: TabData | undefined) {
  return <ContentPane tabs={tabs} activeTab={active} activeTool="navigate" onSelectTool={() => undefined} />
}

describe('ContentPane keeps MolViewPane mounted', () => {
  it('across a switch to Settings and after every molview tab is closed', () => {
    counters.mounts = 0; counters.unmounts = 0
    const { container, root, unmount } = mountTree(render([molTab], molTab))
    const rerender = (node: React.ReactElement) => root.render(node)
    expect(container.querySelector('[data-testid="molview"]')).not.toBeNull()
    expect(counters.mounts).toBe(1)

    // Settings in front: the canvas is hidden, not torn down.
    act(() => rerender(render([molTab, settingsTab], settingsTab)))
    expect(counters.unmounts).toBe(0)
    expect(container.querySelector('[data-testid="settings"]')).not.toBeNull()

    // Every molview closed: still mounted, so a later tab can bind again.
    act(() => rerender(render([settingsTab], settingsTab)))
    act(() => rerender(render([], undefined)))
    expect(container.querySelector('[data-testid="welcome"]')).not.toBeNull()
    expect(counters.unmounts).toBe(0)
    expect(counters.mounts).toBe(1)
    unmount()
  })
})
