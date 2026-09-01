/**
 * The New Scene defaults context: where the preference is read, written, and
 * -- the load-bearing part -- waited for.
 *
 * App launch creates the first scene as soon as the worker is ready, which is
 * not ordered against the UI_LOAD round trip. Reading the React state there
 * would hand the factory values to the very scene the preference is meant to
 * shape, so `getDefaults()` awaits the load instead. These tests pin that it
 * waits, and that it still resolves when there is nothing to wait for.
 */

import React from 'react'
import { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IPC } from '@shared/ipcChannels'
import {
  NewSceneDefaultsProvider,
  useNewSceneDefaults,
} from '@renderer/contexts/NewSceneDefaultsContext'
import { FACTORY_NEW_SCENE_DEFAULTS } from '@renderer/data/newSceneDefaults'
import {
  mountTree,
  flushPromises,
  setupElectronAPI,
  teardownElectronAPI,
} from '@renderer/__test__/helpers/testHarness'

void React

const STORED = {
  aaPreset: 'ultra',
  aoEnabled: true,
  aoPreset: 'high',
  bgcolor: '#ffffff',
  useColproof: true,
}

let api: ReturnType<typeof setupElectronAPI>
let ctx: ReturnType<typeof useNewSceneDefaults> | null = null

function Probe(): React.JSX.Element {
  ctx = useNewSceneDefaults()
  return <div />
}

function mount() {
  return mountTree(
    <NewSceneDefaultsProvider>
      <Probe />
    </NewSceneDefaultsProvider>,
  )
}

beforeEach(() => {
  ctx = null
})
afterEach(() => teardownElectronAPI())

describe('NewSceneDefaultsProvider', () => {
  it('reads the persisted defaults on mount', async () => {
    api = setupElectronAPI({
      invoke: vi.fn(async (c: string) =>
        c === IPC.UI_LOAD ? { newSceneDefaults: STORED } : undefined,
      ),
    })
    const h = mount()
    await flushPromises()

    expect(ctx!.defaults).toEqual(STORED)
    expect(await ctx!.getDefaults()).toEqual(STORED)
    h.unmount()
  })

  it('persists what setDefaults is given, under one key', async () => {
    api = setupElectronAPI()
    const h = mount()
    await flushPromises()

    const next = { ...FACTORY_NEW_SCENE_DEFAULTS, bgcolor: '#ffffff' }
    act(() => ctx!.setDefaults(next))
    await flushPromises()

    expect(api.invoke).toHaveBeenCalledWith(IPC.UI_SAVE, { newSceneDefaults: next })
    expect(await ctx!.getDefaults()).toEqual(next)
    h.unmount()
  })

  it('getDefaults waits for a slow UI_LOAD instead of answering with the factory values', async () => {
    // The launch race: without the wait, the first scene is created from the
    // factory values while the user's preference is still in flight.
    let release: (v: unknown) => void = () => {}
    api = setupElectronAPI({
      invoke: vi.fn((c: string) =>
        c === IPC.UI_LOAD
          ? new Promise((r) => {
              release = r
            })
          : Promise.resolve(undefined),
      ),
    })
    const h = mount()
    await flushPromises()

    let resolved: unknown = 'pending'
    void ctx!.getDefaults().then((d) => {
      resolved = d
    })
    await flushPromises()
    expect(resolved).toBe('pending')

    release({ newSceneDefaults: STORED })
    await flushPromises()
    expect(resolved).toEqual(STORED)
    h.unmount()
  })

  it('getDefaults resolves when there is no electronAPI at all (vite dev)', async () => {
    teardownElectronAPI()
    const h = mount()
    await flushPromises()

    expect(await ctx!.getDefaults()).toEqual(FACTORY_NEW_SCENE_DEFAULTS)
    h.unmount()
  })
})
