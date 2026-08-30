/**
 * @file state/layout/LayoutProvider.test.tsx
 * @description What the layout provider promises its subscribers.
 *
 * The reason it exists is the drag storm: a splitter drag fires onChange per
 * pointer event, and each used to re-render App and every pane under it.
 * The first test pins that a drag re-renders nothing and still persists
 * once, with the last sizes. The others pin the load and the reactive flags.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React, { useEffect, useRef } from 'react'
import { act } from 'react'
import { IPC } from '@shared/ipcChannels'
import { PERSIST_DEBOUNCE_MS } from '@renderer/utils/timing'
import { mountTree, flushPromises, setupElectronAPI, teardownElectronAPI } from '@renderer/__test__/helpers/testHarness'
import { LayoutProvider, useLayout, useLayoutDispatch, type LayoutDispatch, type LayoutValues } from './LayoutProvider'

void React

interface Live {
  d: LayoutDispatch
  v: LayoutValues
  renders: { values: number; dispatch: number }
}

function mount(): { live: Live; unmount: () => void } {
  const live: Live = {
    d: null as unknown as LayoutDispatch,
    v: null as unknown as LayoutValues,
    renders: { values: 0, dispatch: 0 },
  }
  const ValuesProbe: React.FC = () => {
    live.v = useLayout()
    const n = useRef(0); n.current += 1
    useEffect(() => { live.renders.values = n.current })
    return null
  }
  const DispatchProbe: React.FC = () => {
    live.d = useLayoutDispatch()
    const n = useRef(0); n.current += 1
    useEffect(() => { live.renders.dispatch = n.current })
    return null
  }
  const { unmount } = mountTree(
    <LayoutProvider>
      <ValuesProbe />
      <DispatchProbe />
    </LayoutProvider>,
  )
  return { live, unmount }
}

const savesOf = (api: ReturnType<typeof setupElectronAPI>) =>
  (api.invoke.mock.calls as unknown[][]).filter((c) => c[0] === IPC.LAYOUT_SAVE)

afterEach(() => teardownElectronAPI())

describe('LayoutProvider', () => {
  it('a splitter drag re-renders no subscriber and persists once, with the last sizes', async () => {
    const api = setupElectronAPI({ invoke: vi.fn(() => Promise.resolve(undefined)) })
    const { live, unmount } = mount()
    await flushPromises()
    await flushPromises()
    const before = { ...live.renders }

    act(() => {
      for (let i = 0; i < 50; i++) live.d.setMainSizes([i, 100])
    })
    expect(live.renders).toEqual(before)
    expect(savesOf(api)).toHaveLength(0)

    await new Promise((r) => setTimeout(r, PERSIST_DEBOUNCE_MS + 50))
    const saves = savesOf(api)
    expect(saves).toHaveLength(1)
    expect((saves[0][1] as { mainSizes: number[] }).mainSizes).toEqual([49, 100])
    // The live record has the drag; the loaded sizes do not.
    expect(live.d.getLayoutSnapshot().mainSizes).toEqual([49, 100])
    expect(live.v.savedSizes.mainSizes).toEqual([])
    unmount()
  })

  it('applies the stored layout on load', async () => {
    setupElectronAPI({
      invoke: vi.fn((ch: string) =>
        ch === IPC.LAYOUT_LOAD
          ? Promise.resolve({ inspectorOpen: true, mainSizes: [300, 900], viewCollapsed: { explorer: { scene: true } } })
          : Promise.resolve(undefined),
      ),
    })
    const { live, unmount } = mount()
    expect(live.v.loaded).toBe(false)
    await flushPromises()
    await flushPromises()
    expect(live.v.loaded).toBe(true)
    expect(live.v.inspectorOpen).toBe(true)
    expect(live.v.savedSizes.mainSizes).toEqual([300, 900])
    expect(live.v.viewCollapsed.explorer).toEqual({ scene: true })
    unmount()
  })

  it('the flags the UI renders from are reactive, and the dispatch slice never is', async () => {
    setupElectronAPI({ invoke: vi.fn(() => Promise.resolve(undefined)) })
    const { live, unmount } = mount()
    await flushPromises()
    await flushPromises()
    const before = { ...live.renders }

    act(() => live.d.setInspectorOpen(true))
    expect(live.v.inspectorOpen).toBe(true)
    expect(live.renders.values).toBe(before.values + 1)
    // Same value again: no render.
    act(() => live.d.setInspectorOpen(true))
    expect(live.renders.values).toBe(before.values + 1)

    act(() => live.d.setViewCollapsed('explorer', { scene: true, color: false }))
    expect(live.v.viewCollapsed.explorer).toEqual({ scene: true, color: false })
    expect(live.renders.dispatch).toBe(before.dispatch)
    unmount()
  })
})
