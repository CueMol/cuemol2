/**
 * Degrade-detection test for useActiveViewState (extracted in E from
 * App.tsx's inline view-state polling).
 *
 * Pins the contract that App.tsx and MenuBar rely on:
 *   1. No active molview tab -> all three values are null and the native menu
 *      is told all three controls are disabled (`enabled: false`).
 *   2. Active molview tab -> cm.getView{Projection,CenterMark} and
 *      cm.getSceneBgColor are called, results update the cache and a single
 *      `MENU_UPDATE_STATE` invoke is issued with the fetched values.
 *   3. onProjectionChanged / onCenterMarkChanged / onBgColorChanged callbacks
 *      update only their own slice of the cache and send a partial
 *      MENU_UPDATE_STATE.
 *
 * After E's optional subscribe-pattern follow-up (worker-side per-property
 * change events), the *internals* of useActiveViewState change but the
 * observable contract above must still hold for these tests to keep passing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { useActiveViewState } from '../hooks/useActiveViewState'
import { IPC } from '../../shared/ipcChannels'
import { makeRenderHook, flushPromises, setupElectronAPI, teardownElectronAPI } from './helpers/testHarness'

interface MockCm {
  invokeService: ReturnType<typeof vi.fn>
}

// After the apis/* facade collapse the hook calls
// `cm.invokeService('getViewProjection', { viewId })` etc. instead of the
// per-method facade. `makeMockCm` lets a test override the resolved value
// (or throw) per service name; per-service calls are asserted via
// `callsFor(cm, name)`.
type ServiceResolver = () => unknown
const defaultResolvers: Record<string, ServiceResolver> = {
  getViewProjection: () => ({ ok: true, perspective: true }),
  getViewCenterMark: () => ({ ok: true, centerMark: 'crosshair' }),
  getSceneBgColor: () => ({ ok: true, bgColor: 'white' }),
}

function makeMockCm(overrides: Record<string, ServiceResolver> = {}): MockCm {
  const resolvers = { ...defaultResolvers, ...overrides }
  return {
    invokeService: vi.fn(async (name: string, _args: unknown) => resolvers[name]?.()),
  }
}

/** Recorded `invokeService` payloads for a given service name. */
function callsFor(cm: MockCm, name: string): unknown[] {
  return cm.invokeService.mock.calls
    .filter((c) => c[0] === name)
    .map((c) => c[1])
}

describe('useActiveViewState', () => {
  let api: ReturnType<typeof setupElectronAPI>

  beforeEach(() => {
    api = setupElectronAPI()
  })

  afterEach(() => {
    teardownElectronAPI()
    vi.restoreAllMocks()
  })

  it('no active molview tab → all nulls + menu state disabled', async () => {
    const cm = makeMockCm()
    const h = makeRenderHook(() =>
      useActiveViewState({
        cm: cm as unknown as AsyncCueMol,
        activeMolViewId: undefined,
        getActiveSceneInfo: () => null,
      }),
    )

    await flushPromises()

    expect(h.result.viewProjection).toBeNull()
    expect(h.result.viewCenterMark).toBeNull()
    expect(h.result.sceneBgColor).toBeNull()
    expect(callsFor(cm, 'getViewProjection')).toHaveLength(0)

    const lastInvoke = api.invoke.mock.calls.at(-1)
    expect(lastInvoke?.[0]).toBe(IPC.MENU_UPDATE_STATE)
    const state = lastInvoke?.[1] as Record<string, { enabled: boolean }>
    expect(state.viewProjection.enabled).toBe(false)
    expect(state.viewCenterMark.enabled).toBe(false)
    expect(state.sceneBgColor.enabled).toBe(false)

    h.unmount()
  })

  it('active molview tab → fetches all three, updates cache, syncs menu', async () => {
    const cm = makeMockCm({
      getViewProjection: () => ({ ok: true, perspective: false }),
      getViewCenterMark: () => ({ ok: true, centerMark: 'axis' }),
      getSceneBgColor: () => ({ ok: true, bgColor: 'black' }),
    })
    const h = makeRenderHook(() =>
      useActiveViewState({
        cm: cm as unknown as AsyncCueMol,
        activeMolViewId: 5,
        getActiveSceneInfo: () => ({ scene_uid: 1, view_id: 5 }),
      }),
    )

    await flushPromises()

    expect(callsFor(cm, 'getViewProjection')).toContainEqual({ viewId: 5 })
    expect(callsFor(cm, 'getViewCenterMark')).toContainEqual({ viewId: 5 })
    expect(callsFor(cm, 'getSceneBgColor')).toContainEqual({ sceneId: 1 })

    expect(h.result.viewProjection).toBe(false)
    expect(h.result.viewCenterMark).toBe('axis')
    expect(h.result.sceneBgColor).toBe('black')

    const menuStateInvoke = api.invoke.mock.calls.find(
      (c: unknown[]) => c[0] === IPC.MENU_UPDATE_STATE
        && (c[1] as Record<string, { centerMark?: string }>)?.viewCenterMark?.centerMark === 'axis',
    )
    expect(menuStateInvoke).toBeTruthy()
    const state = menuStateInvoke![1] as Record<string, { enabled: boolean; perspective?: boolean; centerMark?: string; bgColor?: string }>
    expect(state.viewProjection).toEqual({ enabled: true, perspective: false })
    expect(state.viewCenterMark).toEqual({ enabled: true, centerMark: 'axis' })
    expect(state.sceneBgColor).toEqual({ enabled: true, bgColor: 'black' })

    h.unmount()
  })

  it('failed fetch (rejection) → all nulls + disabled menu', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const cm = makeMockCm({
      getViewProjection: () => { throw new Error('boom') },
    })
    const h = makeRenderHook(() =>
      useActiveViewState({
        cm: cm as unknown as AsyncCueMol,
        activeMolViewId: 5,
        getActiveSceneInfo: () => ({ scene_uid: 1, view_id: 5 }),
      }),
    )

    await flushPromises()

    expect(h.result.viewProjection).toBeNull()
    expect(h.result.viewCenterMark).toBeNull()
    expect(h.result.sceneBgColor).toBeNull()

    h.unmount()
  })

  it('onProjectionChanged updates only viewProjection + sends partial menu state', async () => {
    const cm = makeMockCm()
    const h = makeRenderHook(() =>
      useActiveViewState({
        cm: cm as unknown as AsyncCueMol,
        activeMolViewId: 5,
        getActiveSceneInfo: () => ({ scene_uid: 1, view_id: 5 }),
      }),
    )

    await flushPromises()
    api.invoke.mockClear()

    await act(async () => {
      h.result.onProjectionChanged(false)
    })
    await flushPromises()

    expect(h.result.viewProjection).toBe(false)
    // The other two values should not be re-fetched on a setter callback
    const projInvoke = api.invoke.mock.calls.at(-1)
    expect(projInvoke?.[0]).toBe(IPC.MENU_UPDATE_STATE)
    const state = projInvoke?.[1] as Record<string, unknown>
    expect(state.viewProjection).toEqual({ enabled: true, perspective: false })
    expect(state.viewCenterMark).toBeUndefined()
    expect(state.sceneBgColor).toBeUndefined()

    h.unmount()
  })

  it('onBgColorChanged updates only sceneBgColor', async () => {
    const cm = makeMockCm()
    const h = makeRenderHook(() =>
      useActiveViewState({
        cm: cm as unknown as AsyncCueMol,
        activeMolViewId: 5,
        getActiveSceneInfo: () => ({ scene_uid: 1, view_id: 5 }),
      }),
    )

    await flushPromises()
    api.invoke.mockClear()

    await act(async () => {
      h.result.onBgColorChanged('black')
    })
    await flushPromises()

    expect(h.result.sceneBgColor).toBe('black')
    const lastInvoke = api.invoke.mock.calls.at(-1)
    const state = lastInvoke?.[1] as Record<string, unknown>
    expect(state.sceneBgColor).toEqual({ enabled: true, bgColor: 'black' })
    expect(state.viewProjection).toBeUndefined()
    expect(state.viewCenterMark).toBeUndefined()

    h.unmount()
  })

  it('failed `ok: false` projection → null without throwing', async () => {
    const cm = makeMockCm({
      getViewProjection: () => ({ ok: false, perspective: false }),
    })
    const h = makeRenderHook(() =>
      useActiveViewState({
        cm: cm as unknown as AsyncCueMol,
        activeMolViewId: 5,
        getActiveSceneInfo: () => ({ scene_uid: 1, view_id: 5 }),
      }),
    )

    await flushPromises()

    expect(h.result.viewProjection).toBeNull()
    // CenterMark and bgColor still resolve normally
    expect(h.result.viewCenterMark).toBe('crosshair')
    expect(h.result.sceneBgColor).toBe('white')

    h.unmount()
  })
})
