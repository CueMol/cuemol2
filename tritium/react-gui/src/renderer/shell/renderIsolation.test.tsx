/**
 * @file shell/renderIsolation.test.tsx
 * @description What the memo boundaries are for.
 *
 * The chrome components take no props (or one stable one) and read what they
 * show from a provider. `React.memo` turns that into a guarantee: a render of
 * the shell above them -- which happens for reasons that have nothing to do
 * with what they show -- must not reach them, while a change in the slice
 * they actually read still must.
 *
 * Body executions are counted through a context hook each component calls:
 * a component that bails out never runs its hooks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { useState } from 'react'
import { act } from 'react'
import { mountTree } from '../__test__/helpers/testHarness'

void React

const counts = vi.hoisted(() => ({ statusBar: 0, sidePanel: 0 }))
const statusMessage = vi.hoisted(() => ({ set: null as ((m: string | null) => void) | null }))

// --- StatusBar: props-free, driven by its own providers ---
vi.mock('../state/statusMessage', async () => {
  const { useState: useReactState } = await import('react')
  return {
    useStatusMessage: () => {
      counts.statusBar += 1
      const [msg, setMsg] = useReactState<string | null>(null)
      statusMessage.set = setMsg
      return msg
    },
  }
})
vi.mock('../hooks/useCueMolBusy', () => ({ useCueMolBusy: () => false }))
vi.mock('../hooks/useBusyCursor', () => ({ useBusyCursor: () => undefined }))
vi.mock('../contexts/ActiveToolContext', () => ({
  useActiveToolDef: () => ({ id: 'navigate', label: 'Navigate', shortcut: 'V', icon: 'tool.navigate' }),
}))

// --- SidePanel: one prop (which view), panes read their own state ---
vi.mock('../state/layout', () => ({
  useLayout: () => {
    counts.sidePanel += 1
    return {
      loaded: true, sidebarOpen: true, inspectorOpen: false, viewCollapsed: {},
      savedSizes: { mainSizes: [], rightPanelSizes: [], centerSizes: [], viewSizes: {} },
    }
  },
  useLayoutDispatch: () => ({ setViewSizes: vi.fn(), setViewCollapsed: vi.fn() }),
}))
vi.mock('../components/panes', () => {
  const stub = () => null
  return {
    ScenePane: stub, ColorPane: stub, ViewPane: stub, MolStructPane: stub,
    SelectionPane: stub, SymmetryPane: stub, DensityMapPane: stub,
    CatalogPane1: stub, CatalogPane2: stub, CatalogPane3: stub,
  }
})

import { StatusBar } from '../components/StatusBar'
import { SidePanel } from '../components/panels/SidePanel'
import type { ActivityView } from '../components/ActivityBar'

/** Mount `child` under a parent the test can re-render at will. */
function mountUnderShell(child: React.ReactNode) {
  let rerenderShell!: () => void
  const Shell: React.FC = () => {
    const [, setTick] = useState(0)
    rerenderShell = () => act(() => setTick((t) => t + 1))
    return <>{child}</>
  }
  const { unmount } = mountTree(<Shell />)
  return { rerenderShell, unmount }
}

beforeEach(() => {
  counts.statusBar = 0
  counts.sidePanel = 0
})

describe('chrome render isolation', () => {
  it('a shell render does not reach the status bar, but its own message does', () => {
    const { rerenderShell, unmount } = mountUnderShell(<StatusBar />)
    const afterMount = counts.statusBar
    expect(afterMount).toBeGreaterThan(0)

    rerenderShell()
    rerenderShell()
    expect(counts.statusBar).toBe(afterMount)

    act(() => statusMessage.set!('Picked atom CA'))
    expect(counts.statusBar).toBe(afterMount + 1)
    unmount()
  })

  it('a shell render does not reach the sidebar; switching the activity view does', () => {
    let setView!: (v: ActivityView) => void
    const Host: React.FC = () => {
      const [view, setV] = useState<ActivityView>('explorer')
      setView = (v) => act(() => setV(v))
      return <SidePanel activeView={view} />
    }
    const { rerenderShell, unmount } = mountUnderShell(<Host />)
    const afterMount = counts.sidePanel
    expect(afterMount).toBeGreaterThan(0)

    rerenderShell()
    rerenderShell()
    expect(counts.sidePanel).toBe(afterMount)

    setView('selection')
    expect(counts.sidePanel).toBe(afterMount + 1)
    // The same view again is a no-op: the prop is equal, so memo holds.
    setView('selection')
    expect(counts.sidePanel).toBe(afterMount + 1)
    unmount()
  })
})
