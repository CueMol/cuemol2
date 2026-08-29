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
import { mountTree, flushPromises, setupElectronAPI, teardownElectronAPI } from '../../__test__/helpers/testHarness'
import { ActiveViewStateProvider, useActiveViewDispatch, useActiveViewValues, type ActiveViewDispatch, type ActiveViewValues } from './ActiveViewStateProvider'

void React

const cm = vi.hoisted(() => ({
  invokeService: vi.fn(async (name: string) => {
    if (name === 'getViewProjection') return { ok: true, perspective: false }
    if (name === 'getViewCenterMark') return { ok: true, centerMark: 'axis' }
    if (name === 'getSceneBgColor') return { ok: true, bgColor: 'black' }
    return { ok: true }
  }),
}))
const scene = vi.hoisted(() => ({ activeMolViewId: undefined as number | undefined, activeSceneId: undefined as number | undefined }))

vi.mock('../../hooks/cuemol/useCueMol', () => ({ useCueMol: () => ({ cm, cueMolReady: true }) }))
vi.mock('../../hooks/useSceneExportCaps', () => ({ useSceneExportCaps: () => ['png', 'umbreon'] }))
vi.mock('../workspace', () => ({
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
    expect(live.v).toEqual({ viewProjection: null, viewCenterMark: null, sceneBgColor: null, exportAvailable: ['png', 'umbreon'] })
    expect(menuUpdates(api).at(-1)).toEqual({
      viewProjection: { enabled: false, perspective: null },
      viewCenterMark: { enabled: false, centerMark: null },
      sceneBgColor: { enabled: false, bgColor: null },
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
    expect(live.v).toMatchObject({ viewProjection: false, viewCenterMark: 'axis', sceneBgColor: 'black' })
    expect(menuUpdates(api).at(-1)).toEqual({
      viewProjection: { enabled: true, perspective: false },
      viewCenterMark: { enabled: true, centerMark: 'axis' },
      sceneBgColor: { enabled: true, bgColor: 'black' },
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
    unmount()
  })
})
