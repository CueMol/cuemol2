/**
 * @file state/activeView/ActiveViewStateProvider.test.tsx
 * @description The native-menu mirror, pinned at the provider boundary.
 *
 * The values here are what the View menu's radio items show. These pin the
 * MENU_UPDATE_STATE payloads for the three moments that matter: no molview
 * in front (everything disabled), a molview in front (its fetched values,
 * scene items enabled), and a user change through a command (only that
 * attribute is pushed).
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { IPC } from '@shared/ipcChannels'
import { mountTree, flushPromises, setupElectronAPI, teardownElectronAPI } from '@renderer/__test__/helpers/testHarness'
import { SEM_SCENE, SEM_VIEW } from '@renderer/event'
import { ActiveViewStateProvider, useActiveViewDispatch, useActiveViewValues, type ActiveViewDispatch, type ActiveViewValues } from './ActiveViewStateProvider'

void React

const cm = vi.hoisted(() => ({
  invokeService: vi.fn(async (name: string) => {
    if (name === 'getViewProjection') return { ok: true, perspective: false }
    if (name === 'getViewCenterMark') return { ok: true, centerMark: 'axis' }
    if (name === 'getSceneBgColor') return { ok: true, bgColor: 'black' }
    if (name === 'getSceneColorProofing') return { ok: true, enabled: true }
    return { ok: true }
  }),
}))
const scene = vi.hoisted(() => ({ activeMolViewId: undefined as number | undefined, activeSceneId: undefined as number | undefined }))

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({ useCueMol: () => ({ cm, cueMolReady: true }) }))
vi.mock('@renderer/hooks/useSceneExportCaps', () => ({ useSceneExportCaps: () => ['png', 'umbreon'] }))
// The mirrored values also refresh on a C++ property change; each
// subscription is captured so a test can fire it.
const listeners = vi.hoisted(() => ({ all: [] as Record<string, unknown>[] }))
vi.mock('@renderer/hooks/cuemol/useCueMolEventListener', () => ({
  useCueMolEventListener: (opts: Record<string, unknown>) => { listeners.all.push(opts) },
}))
vi.mock('@renderer/state/workspace', () => ({
  useActiveScene: () => ({ ...scene, hasScene: scene.activeMolViewId !== undefined }),
}))

interface Live { v: ActiveViewValues; d: ActiveViewDispatch }

function mount(): { live: Live; unmount: () => void; rerender: () => void } {
  const live: Live = { v: null as unknown as ActiveViewValues, d: null as unknown as ActiveViewDispatch }
  const Probe: React.FC = () => {
    live.v = useActiveViewValues()
    live.d = useActiveViewDispatch()
    return null
  }
  const tree = () => <ActiveViewStateProvider><Probe /></ActiveViewStateProvider>
  const { root, unmount } = mountTree(tree())
  return { live, unmount, rerender: () => act(() => root.render(tree())) }
}

const menuUpdates = (api: ReturnType<typeof setupElectronAPI>) =>
  (api.invoke.mock.calls as unknown[][]).filter((c) => c[0] === IPC.MENU_UPDATE_STATE).map((c) => c[1])

let api: ReturnType<typeof setupElectronAPI>
beforeEach(() => {
  listeners.all = []
  api = setupElectronAPI({ invoke: vi.fn(() => Promise.resolve(undefined)) })
  scene.activeMolViewId = undefined
  scene.activeSceneId = undefined
  cm.invokeService.mockClear()
})
afterEach(() => teardownElectronAPI())

describe('ActiveViewStateProvider', () => {
  it('with no molview in front, every mirrored item is disabled', async () => {
    const { live, unmount } = mount()
    await flushPromises()
    expect(live.v).toEqual({
      viewProjection: null, viewCenterMark: null, sceneBgColor: null,
      sceneColorProof: null, exportAvailable: ['png', 'umbreon'],
    })
    expect(menuUpdates(api).at(-1)).toEqual({
      viewProjection: { enabled: false, perspective: null },
      viewCenterMark: { enabled: false, centerMark: null },
      sceneBgColor: { enabled: false, bgColor: null },
      sceneColorProof: { enabled: false, checked: false },
      sceneOps: { enabled: false },
    })
    unmount()
  })

  it('with a molview in front, the fetched values are mirrored and scene items enabled', async () => {
    scene.activeMolViewId = 7
    scene.activeSceneId = 100
    const { live, unmount } = mount()
    await flushPromises()
    await flushPromises()
    expect(cm.invokeService).toHaveBeenCalledWith('getViewProjection', { viewId: 7 })
    expect(cm.invokeService).toHaveBeenCalledWith('getSceneBgColor', { sceneId: 100 })
    expect(live.v).toMatchObject({
      viewProjection: false, viewCenterMark: 'axis', sceneBgColor: 'black',
      sceneColorProof: true,
    })
    expect(menuUpdates(api).at(-1)).toEqual({
      viewProjection: { enabled: true, perspective: false },
      viewCenterMark: { enabled: true, centerMark: 'axis' },
      sceneBgColor: { enabled: true, bgColor: 'black' },
      sceneColorProof: { enabled: true, checked: true },
      sceneOps: { enabled: true },
    })
    unmount()
  })

  it('a change through a command pushes only that attribute', async () => {
    scene.activeMolViewId = 7
    scene.activeSceneId = 100
    const { live, unmount } = mount()
    await flushPromises()
    await flushPromises()
    api.invoke.mockClear()

    act(() => live.d.onProjectionChanged(true))
    expect(live.v.viewProjection).toBe(true)
    expect(menuUpdates(api)).toEqual([{ viewProjection: { enabled: true, perspective: true } }])

    act(() => live.d.onBgColorChanged('white'))
    expect(menuUpdates(api).at(-1)).toEqual({ sceneBgColor: { enabled: true, bgColor: 'white' } })

    // Colour proofing reports what actually happened: the worker leaves it
    // off when no profile is configured, so the check follows its answer.
    act(() => live.d.onColorProofingChanged(false))
    expect(menuUpdates(api).at(-1)).toEqual({ sceneColorProof: { enabled: true, checked: false } })
    unmount()
  })
})

// The values used to be read only on a tab switch, so a change made anywhere
// else -- an undo, a script, a .qsc load, the inspector's Scene page -- left
// the native menu showing the old one until the next switch.
describe('ActiveViewStateProvider - changes made elsewhere', () => {
  /** Fire the subscription whose scope mask matches, through its filter. */
  function fire(srcMask: number, payload: Record<string, unknown>) {
    const l = listeners.all.find((o) => o.srcMask === srcMask && o.enabled)
    if (!l) throw new Error(`no enabled subscription for srcMask ${srcMask}`)
    const args = { obj: payload }
    const filter = l.filter as ((a: unknown) => boolean) | undefined
    if (filter && !filter(args)) return false
    ;(l.handler as (a: unknown) => void)(args)
    return true
  }

  it('re-reads the scene when its background or colour proofing changes', async () => {
    scene.activeMolViewId = 7
    scene.activeSceneId = 100
    const h = mount()
    await flushPromises()
    await flushPromises()
    cm.invokeService.mockClear()

    expect(fire(SEM_SCENE, { propname: 'bgcolor' })).toBe(true)
    await flushPromises()
    expect(cm.invokeService).toHaveBeenCalledWith('getSceneBgColor', { sceneId: 100 })

    cm.invokeService.mockClear()
    expect(fire(SEM_SCENE, { propname: 'use_colproof' })).toBe(true)
    await flushPromises()
    expect(cm.invokeService).toHaveBeenCalledWith('getSceneColorProofing', { sceneId: 100 })
    h.unmount()
  })

  it('ignores scene properties it does not mirror', async () => {
    scene.activeMolViewId = 7
    scene.activeSceneId = 100
    const h = mount()
    await flushPromises()
    await flushPromises()
    cm.invokeService.mockClear()

    expect(fire(SEM_SCENE, { propname: 'name' })).toBe(false)
    await flushPromises()
    expect(cm.invokeService).not.toHaveBeenCalled()
    h.unmount()
  })

  it('re-reads the view for its own property changes only', async () => {
    scene.activeMolViewId = 7
    scene.activeSceneId = 100
    const h = mount()
    await flushPromises()
    await flushPromises()
    cm.invokeService.mockClear()

    // A view event is sourced by its scene, so it names the view it is about.
    expect(fire(SEM_VIEW, { propname: 'centerMark', target_uid: 7 })).toBe(true)
    await flushPromises()
    expect(cm.invokeService).toHaveBeenCalledWith('getViewCenterMark', { viewId: 7 })

    cm.invokeService.mockClear()
    // Another view in the same scene is not this tab's.
    expect(fire(SEM_VIEW, { propname: 'centerMark', target_uid: 9 })).toBe(false)
    await flushPromises()
    expect(cm.invokeService).not.toHaveBeenCalled()
    h.unmount()
  })
})
