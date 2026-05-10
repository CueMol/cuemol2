/**
 * Pins the UXP-parity quit chain wired by useQuitHandler:
 *   APP_QUIT_REQUEST → walk every tab via handleCloseTab →
 *     - all true   → invoke(APP_QUIT_PROCEED) exactly once
 *     - one false  → stop walking, do not invoke APP_QUIT_PROCEED
 *
 * Mirrors UXP `Qm2Main.onCloseEvent` (uxp_gui/cuemol2/base/content/cuemol2.js:579).
 */

import React, { useRef } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IPC } from '../../shared/ipcChannels'
import type { TabData } from '../types'
import { useQuitHandler } from '../hooks/useQuitHandler'
import {
  makeRenderHook,
  setupElectronAPI,
  teardownElectronAPI,
  flushPromises,
} from './helpers/testHarness'

void React

interface Harness {
  api: ReturnType<typeof setupElectronAPI>
  triggerQuitRequest: () => Promise<void>
  handleCloseTab: ReturnType<typeof vi.fn>
  setActiveTab: ReturnType<typeof vi.fn>
  tabsRef: React.RefObject<TabData[]>
  unmount: () => void
}

function mount(opts: {
  tabs: TabData[]
  closeResults: Array<boolean | Error>
}): Harness {
  let captured: (() => void) | null = null
  const onPush = vi.fn((channel: string, cb: () => void) => {
    if (channel === IPC.APP_QUIT_REQUEST) captured = cb
    return () => undefined
  })
  const invoke = vi.fn().mockResolvedValue(undefined)
  const api = setupElectronAPI({ onPush, invoke })

  const handleCloseTab = vi.fn(async (_id: string) => {
    const next = opts.closeResults.shift()
    if (next instanceof Error) throw next
    return next ?? true
  })
  const setActiveTab = vi.fn()

  let tabsRef!: React.RefObject<TabData[]>

  const handle = makeRenderHook(() => {
    const ref = useRef<TabData[]>(opts.tabs)
    tabsRef = ref
    useQuitHandler({ tabsRef: ref, handleCloseTab, setActiveTab })
  })

  if (!captured) throw new Error('APP_QUIT_REQUEST listener was not registered')

  return {
    api,
    triggerQuitRequest: async () => {
      ;(captured as unknown as () => void)()
      await flushPromises()
      await flushPromises()
    },
    handleCloseTab,
    setActiveTab,
    tabsRef,
    unmount: handle.unmount,
  }
}

describe('useQuitHandler (UXP-parity quit chain)', () => {
  beforeEach(() => {
    setupElectronAPI()
  })

  afterEach(() => {
    teardownElectronAPI()
    vi.restoreAllMocks()
  })

  it('walks all tabs in order and calls APP_QUIT_PROCEED when every close succeeds', async () => {
    const tabs: TabData[] = [
      { id: 'molview-1', title: 'A', icon: 'cube', type: 'molview', viewId: 1 },
      { id: 'molview-2', title: 'B', icon: 'cube', type: 'molview', viewId: 2 },
      { id: 'welcome',    title: 'W', icon: 'home', type: 'welcome' },
    ]
    const h = mount({ tabs, closeResults: [true, true, true] })

    await h.triggerQuitRequest()

    expect(h.handleCloseTab.mock.calls.map((c) => c[0])).toEqual([
      'molview-1', 'molview-2', 'welcome',
    ])
    // setActiveTab is called only for molview tabs (UXP parity: switch to
    // the tab being closed so the user sees the confirm dialog target).
    expect(h.setActiveTab.mock.calls.map((c) => c[0])).toEqual([
      'molview-1', 'molview-2',
    ])
    expect(h.api.invoke).toHaveBeenCalledTimes(1)
    expect(h.api.invoke).toHaveBeenCalledWith(IPC.APP_QUIT_PROCEED)

    h.unmount()
  })

  it('aborts the chain when any tab returns false and does NOT invoke APP_QUIT_PROCEED', async () => {
    const tabs: TabData[] = [
      { id: 'molview-1', title: 'A', icon: 'cube', type: 'molview', viewId: 1 },
      { id: 'molview-2', title: 'B', icon: 'cube', type: 'molview', viewId: 2 },
      { id: 'molview-3', title: 'C', icon: 'cube', type: 'molview', viewId: 3 },
    ]
    // Second tab cancels (user clicked Cancel in confirm dialog).
    const h = mount({ tabs, closeResults: [true, false, true] })

    await h.triggerQuitRequest()

    expect(h.handleCloseTab.mock.calls.map((c) => c[0])).toEqual([
      'molview-1', 'molview-2',
    ])
    expect(h.api.invoke).not.toHaveBeenCalled()

    h.unmount()
  })

  it('is idempotent under re-entrancy (a second APP_QUIT_REQUEST while the first is in flight is ignored)', async () => {
    const tabs: TabData[] = [
      { id: 'molview-1', title: 'A', icon: 'cube', type: 'molview', viewId: 1 },
    ]
    // Defer the close so we can fire the second request before it resolves.
    let release: (v: boolean) => void
    const pending = new Promise<boolean>((r) => { release = r })
    const onPush = vi.fn()
    let captured: (() => void) | null = null
    onPush.mockImplementation((channel: string, cb: () => void) => {
      if (channel === IPC.APP_QUIT_REQUEST) captured = cb
      return () => undefined
    })
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = setupElectronAPI({ onPush, invoke })
    const handleCloseTab = vi.fn(async () => pending)
    const setActiveTab = vi.fn()

    const handle = makeRenderHook(() => {
      const ref = useRef<TabData[]>(tabs)
      useQuitHandler({ tabsRef: ref, handleCloseTab, setActiveTab })
    })

    if (!captured) throw new Error('listener not registered')
    ;(captured as unknown as () => void)()
    // Second attempt while the first is still awaiting handleCloseTab.
    ;(captured as unknown as () => void)()
    await flushPromises()

    // Only the first invocation has scheduled handleCloseTab.
    expect(handleCloseTab).toHaveBeenCalledTimes(1)

    // Resolve and let the chain finish.
    release!(true)
    await flushPromises()
    await flushPromises()

    expect(api.invoke).toHaveBeenCalledTimes(1)
    expect(api.invoke).toHaveBeenCalledWith(IPC.APP_QUIT_PROCEED)

    handle.unmount()
  })
})
