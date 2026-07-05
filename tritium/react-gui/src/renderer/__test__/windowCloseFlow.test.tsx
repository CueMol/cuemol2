/**
 * Pins the UXP-parity window-close chain wired by useWindowCloseHandler:
 *   WINDOW_CLOSE_REQUEST -> walk every tab via handleCloseTab ->
 *     - all true   -> invoke(WINDOW_CLOSE_PROCEED, { proceed: true })
 *     - one false  -> stop walking, invoke(WINDOW_CLOSE_PROCEED,
 *                     { proceed: false }) exactly once
 *
 * Replying on cancel is mandatory: main clears its in-flight flag from the
 * reply, so omitting it would wedge the close funnel.
 *
 * Mirrors UXP `Qm2Main.onCloseEvent` (uxp_gui/cuemol2/base/content/cuemol2.js:579).
 */

import React, { useRef } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IPC } from '../../shared/ipcChannels'
import type { TabData } from '../types'
import { useWindowCloseHandler } from '../hooks/useWindowCloseHandler'
import {
  makeRenderHook,
  setupElectronAPI,
  teardownElectronAPI,
  flushPromises,
} from './helpers/testHarness'

void React

interface Harness {
  api: ReturnType<typeof setupElectronAPI>
  triggerCloseRequest: () => Promise<void>
  handleCloseTab: ReturnType<typeof vi.fn>
  setActiveTab: ReturnType<typeof vi.fn>
  tabsRef: React.RefObject<TabData[]>
  unmount: () => void
}

function mount(opts: {
  tabs: TabData[]
  closeResults: Array<boolean | Error>
  onBeforeProceed?: () => Promise<void>
}): Harness {
  let captured: (() => void) | null = null
  const onPush = vi.fn((channel: string, cb: () => void) => {
    if (channel === IPC.WINDOW_CLOSE_REQUEST) captured = cb
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
    useWindowCloseHandler({
      tabsRef: ref,
      handleCloseTab,
      setActiveTab,
      onBeforeProceed: opts.onBeforeProceed,
    })
  })

  if (!captured) throw new Error('WINDOW_CLOSE_REQUEST listener was not registered')

  return {
    api,
    triggerCloseRequest: async () => {
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

describe('useWindowCloseHandler (UXP-parity window-close chain)', () => {
  beforeEach(() => {
    setupElectronAPI()
  })

  afterEach(() => {
    teardownElectronAPI()
    vi.restoreAllMocks()
  })

  it('walks all tabs in order and calls WINDOW_CLOSE_PROCEED { proceed: true } when every close succeeds', async () => {
    const tabs: TabData[] = [
      { id: 'molview-1', title: 'A', icon: 'file.molview', type: 'molview', viewId: 1 },
      { id: 'molview-2', title: 'B', icon: 'file.molview', type: 'molview', viewId: 2 },
      { id: 'welcome',    title: 'W', icon: 'file.welcome', type: 'welcome' },
    ]
    const h = mount({ tabs, closeResults: [true, true, true] })

    await h.triggerCloseRequest()

    expect(h.handleCloseTab.mock.calls.map((c) => c[0])).toEqual([
      'molview-1', 'molview-2', 'welcome',
    ])
    // setActiveTab is called only for molview tabs (UXP parity: switch to
    // the tab being closed so the user sees the confirm dialog target).
    expect(h.setActiveTab.mock.calls.map((c) => c[0])).toEqual([
      'molview-1', 'molview-2',
    ])
    expect(h.api.invoke).toHaveBeenCalledTimes(1)
    expect(h.api.invoke).toHaveBeenCalledWith(IPC.WINDOW_CLOSE_PROCEED, { proceed: true })

    h.unmount()
  })

  it('aborts the walk when any tab returns false and replies WINDOW_CLOSE_PROCEED { proceed: false }', async () => {
    const tabs: TabData[] = [
      { id: 'molview-1', title: 'A', icon: 'file.molview', type: 'molview', viewId: 1 },
      { id: 'molview-2', title: 'B', icon: 'file.molview', type: 'molview', viewId: 2 },
      { id: 'molview-3', title: 'C', icon: 'file.molview', type: 'molview', viewId: 3 },
    ]
    // Second tab cancels (user clicked Cancel in confirm dialog).
    const h = mount({ tabs, closeResults: [true, false, true] })

    await h.triggerCloseRequest()

    expect(h.handleCloseTab.mock.calls.map((c) => c[0])).toEqual([
      'molview-1', 'molview-2',
    ])
    expect(h.api.invoke).toHaveBeenCalledTimes(1)
    expect(h.api.invoke).toHaveBeenCalledWith(IPC.WINDOW_CLOSE_PROCEED, { proceed: false })

    h.unmount()
  })

  it('runs onBeforeProceed (user-style save) before proceed:true when every tab confirms', async () => {
    const order: string[] = []
    const onBeforeProceed = vi.fn(async () => { order.push('save') })
    const tabs: TabData[] = [
      { id: 'molview-1', title: 'A', icon: 'file.molview', type: 'molview', viewId: 1 },
    ]
    const h = mount({ tabs, closeResults: [true], onBeforeProceed })
    h.api.invoke.mockImplementation(async (ch: string) => { order.push(`invoke:${ch}`); return undefined })

    await h.triggerCloseRequest()

    expect(onBeforeProceed).toHaveBeenCalledTimes(1)
    // Save runs before the proceed reply.
    expect(order).toEqual(['save', `invoke:${IPC.WINDOW_CLOSE_PROCEED}`])
    expect(h.api.invoke).toHaveBeenCalledWith(IPC.WINDOW_CLOSE_PROCEED, { proceed: true })

    h.unmount()
  })

  it('does NOT run onBeforeProceed when the user cancels (proceed:false)', async () => {
    const onBeforeProceed = vi.fn(async () => undefined)
    const tabs: TabData[] = [
      { id: 'molview-1', title: 'A', icon: 'file.molview', type: 'molview', viewId: 1 },
      { id: 'molview-2', title: 'B', icon: 'file.molview', type: 'molview', viewId: 2 },
    ]
    const h = mount({ tabs, closeResults: [false], onBeforeProceed })

    await h.triggerCloseRequest()

    expect(onBeforeProceed).not.toHaveBeenCalled()
    expect(h.api.invoke).toHaveBeenCalledWith(IPC.WINDOW_CLOSE_PROCEED, { proceed: false })

    h.unmount()
  })

  it('still proceeds to close when onBeforeProceed throws (save failure must not wedge close)', async () => {
    const onBeforeProceed = vi.fn(async () => { throw new Error('save failed') })
    const tabs: TabData[] = [
      { id: 'molview-1', title: 'A', icon: 'file.molview', type: 'molview', viewId: 1 },
    ]
    const h = mount({ tabs, closeResults: [true], onBeforeProceed })

    await h.triggerCloseRequest()

    expect(onBeforeProceed).toHaveBeenCalledTimes(1)
    expect(h.api.invoke).toHaveBeenCalledWith(IPC.WINDOW_CLOSE_PROCEED, { proceed: true })

    h.unmount()
  })

  it('is idempotent under re-entrancy (a second WINDOW_CLOSE_REQUEST while the first is in flight is ignored)', async () => {
    const tabs: TabData[] = [
      { id: 'molview-1', title: 'A', icon: 'file.molview', type: 'molview', viewId: 1 },
    ]
    // Defer the close so we can fire the second request before it resolves.
    let release: (v: boolean) => void
    const pending = new Promise<boolean>((r) => { release = r })
    const onPush = vi.fn()
    let captured: (() => void) | null = null
    onPush.mockImplementation((channel: string, cb: () => void) => {
      if (channel === IPC.WINDOW_CLOSE_REQUEST) captured = cb
      return () => undefined
    })
    const invoke = vi.fn().mockResolvedValue(undefined)
    const api = setupElectronAPI({ onPush, invoke })
    const handleCloseTab = vi.fn(async () => pending)
    const setActiveTab = vi.fn()

    const handle = makeRenderHook(() => {
      const ref = useRef<TabData[]>(tabs)
      useWindowCloseHandler({ tabsRef: ref, handleCloseTab, setActiveTab })
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
    expect(api.invoke).toHaveBeenCalledWith(IPC.WINDOW_CLOSE_PROCEED, { proceed: true })

    handle.unmount()
  })
})
