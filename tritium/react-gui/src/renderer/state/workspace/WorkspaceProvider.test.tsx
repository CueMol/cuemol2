/**
 * @file state/workspace/WorkspaceProvider.test.tsx
 * @description The side effects a tab's lifetime owns, and what a subscriber
 * pays for.
 *
 * The transitions are pinned in workspaceReducer.test.ts; this file pins what
 * only the provider does: the worker view is activated exactly once per
 * activation and removed exactly once per close (after the prompt, never on a
 * declined one), the ids the imperative readers see are the latest, and a
 * dispatch-only subscriber does not re-render on tab churn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { useEffect, useRef } from 'react'
import { act } from 'react'
import { mountTree, flushPromises } from '@renderer/__test__/helpers/testHarness'
import { WorkspaceProvider, useActiveScene, useWorkspaceDispatch, useWorkspaceTabs, type WorkspaceDispatch } from './WorkspaceProvider'

void React

const cm = vi.hoisted(() => ({
  activateView: vi.fn(async (_id: number) => undefined),
  removeView: vi.fn(async (_id: number) => true),
  invokeService: vi.fn(async () => ({ ok: true })),
  addEventListener: vi.fn(async () => 1),
  removeEventListener: vi.fn(async () => undefined),
}))
const confirm = vi.hoisted(() => ({ impl: async (_viewId: number) => true }))

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm, cueMolReady: true }),
}))
vi.mock('./useConfirmCloseTab', () => ({
  useConfirmCloseTab: () => (viewId: number) => confirm.impl(viewId),
}))

interface Live {
  d: WorkspaceDispatch
  activeSceneId: number | undefined
  activeMolViewId: number | undefined
  tabTitles: string[]
  renders: { dispatchOnly: number; activeScene: number; tabs: number }
}

function mount(): { live: Live; unmount: () => void } {
  const live: Live = {
    d: null as unknown as WorkspaceDispatch,
    activeSceneId: undefined,
    activeMolViewId: undefined,
    tabTitles: [],
    renders: { dispatchOnly: 0, activeScene: 0, tabs: 0 },
  }
  const DispatchProbe: React.FC = () => {
    live.d = useWorkspaceDispatch()
    const n = useRef(0); n.current += 1
    useEffect(() => { live.renders.dispatchOnly = n.current })
    return null
  }
  const ActiveProbe: React.FC = () => {
    const a = useActiveScene()
    live.activeSceneId = a.activeSceneId
    live.activeMolViewId = a.activeMolViewId
    const n = useRef(0); n.current += 1
    useEffect(() => { live.renders.activeScene = n.current })
    return null
  }
  const TabsProbe: React.FC = () => {
    const t = useWorkspaceTabs()
    live.tabTitles = t.tabs.map((x) => x.title)
    const n = useRef(0); n.current += 1
    useEffect(() => { live.renders.tabs = n.current })
    return null
  }
  const { unmount } = mountTree(
    <WorkspaceProvider>
      <DispatchProbe />
      <ActiveProbe />
      <TabsProbe />
    </WorkspaceProvider>,
  )
  return { live, unmount }
}

beforeEach(() => {
  vi.clearAllMocks()
  confirm.impl = async () => true
})

describe('WorkspaceProvider', () => {
  it('activates the worker view once per activation, never on unrelated churn', async () => {
    const { live, unmount } = mount()
    act(() => live.d.openMolViewTab('A:0', 10, 100))
    await flushPromises()
    act(() => live.d.openMolViewTab('B:0', 20, 200))
    await flushPromises()
    expect(cm.activateView.mock.calls.map((c) => c[0])).toEqual([10, 20])

    // Rename and reorder do not touch the active view.
    act(() => live.d.setMolViewTitle(20, 'B renamed:0'))
    act(() => live.d.reorderTabs('molview-20', 'molview-10'))
    await flushPromises()
    expect(cm.activateView).toHaveBeenCalledTimes(2)

    act(() => live.d.activateView(10))
    await flushPromises()
    expect(cm.activateView.mock.calls.map((c) => c[0])).toEqual([10, 20, 10])
    unmount()
  })

  it('closes a tab after the prompt: record gone, active scene cleared, view removed once', async () => {
    const { live, unmount } = mount()
    act(() => live.d.openMolViewTab('A:0', 10, 100))
    expect(live.activeSceneId).toBe(100)

    let closed = false
    await act(async () => {
      closed = await live.d.closeTab('molview-10')
      await flushPromises()
    })
    expect(closed).toBe(true)
    expect(live.tabTitles).toEqual([])
    expect(live.activeSceneId).toBeUndefined()
    expect(live.activeMolViewId).toBeUndefined()
    expect(cm.removeView).toHaveBeenCalledTimes(1)
    expect(cm.removeView).toHaveBeenCalledWith(10)
    unmount()
  })

  it('drops the tab record only once the worker has torn the view down', async () => {
    // The worker stops the scene's animation, releases its GL resources and
    // destroys the scene inside removeView. If the record went first, the
    // UI would move on (activate another view, open a new scene) while the
    // old one was still being dismantled.
    let finishTeardown!: () => void
    cm.removeView.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => { finishTeardown = () => resolve(true) }),
    )
    const { live, unmount } = mount()
    act(() => live.d.openMolViewTab('A:0', 10, 100))

    let closed: Promise<boolean>
    act(() => { closed = live.d.closeTab('molview-10') })
    await act(async () => { await flushPromises() })
    // Prompt passed, worker still busy: the tab is still there.
    expect(cm.removeView).toHaveBeenCalledWith(10)
    expect(live.tabTitles).toEqual(['A:0'])

    await act(async () => { finishTeardown(); await closed; await flushPromises() })
    expect(live.tabTitles).toEqual([])
    unmount()
  })

  it('keeps the tab and the view when the prompt is declined', async () => {
    confirm.impl = async () => false
    const { live, unmount } = mount()
    act(() => live.d.openMolViewTab('A:0', 10, 100))

    let closed = true
    await act(async () => {
      closed = await live.d.closeTab('molview-10')
      await flushPromises()
    })
    expect(closed).toBe(false)
    expect(live.tabTitles).toEqual(['A:0'])
    expect(live.activeSceneId).toBe(100)
    expect(cm.removeView).not.toHaveBeenCalled()
    unmount()
  })

  it('exposes the latest ids to imperative readers', () => {
    const { live, unmount } = mount()
    expect(live.d.getActiveSceneInfo()).toBeUndefined()
    act(() => live.d.openMolViewTab('A:0', 10, 100))
    expect(live.d.getActiveSceneInfo()).toEqual({ scene_uid: 100, view_id: 10 })
    expect(live.d.getActiveViewId()).toBe(10)
    expect(live.d.getActiveTabId()).toBe('molview-10')
    expect(live.d.tabsRef.current?.map((t) => t.viewId)).toEqual([10])
    act(() => live.d.openSettingsTab())
    expect(live.d.getActiveSceneInfo()).toBeUndefined()
    expect(live.d.getActiveTabId()).toBe('__settings__')
    unmount()
  })

  it('a dispatch-only subscriber renders once; an active-scene subscriber only on scene change', () => {
    const { live, unmount } = mount()
    const before = { ...live.renders }
    act(() => live.d.openMolViewTab('A:0', 10, 100))
    act(() => live.d.setMolViewTitle(10, 'A renamed:0'))
    act(() => live.d.openMolViewTab('B:0', 20, 200))
    act(() => live.d.reorderTabs('molview-20', 'molview-10'))
    // Dispatch context is stable: no re-render across four transitions.
    expect(live.renders.dispatchOnly).toBe(before.dispatchOnly)
    // Active scene changed twice (open A, open B); rename and reorder are
    // invisible to it. The tabs subscriber saw every transition.
    expect(live.renders.activeScene - before.activeScene).toBe(2)
    expect(live.renders.tabs - before.tabs).toBe(4)
    unmount()
  })
})
