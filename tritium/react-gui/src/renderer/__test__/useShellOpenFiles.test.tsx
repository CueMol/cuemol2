/**
 * Pins the gating and drain contract for OS-shell / command-line file open
 * (hooks/useShellOpenFiles.ts).
 *
 * The gate is the whole point: dispatching before CueMol is ready, or before
 * the launch scene settles, either loses the file silently or opens it in a
 * second tab. The pull-plus-ping shape is pinned too, since a push that
 * carried the payload would be lost when it arrives before the subscription.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  flushPromises,
  makeRenderHook,
  setupElectronAPI,
  teardownElectronAPI,
} from './helpers/testHarness'
import { IPC } from '@shared/ipcChannels'
import { useShellOpenFiles } from '../hooks/useShellOpenFiles'
import { resetOpenFilePathsForTests } from '../hooks/useOpenFilePaths'

void React

const openPaths = vi.fn((_paths: string[], _opts?: unknown) => Promise.resolve())
vi.mock('../hooks/useOpenFilePaths', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useOpenFilePaths')>(
    '../hooks/useOpenFilePaths',
  )
  return {
    ...actual,
    useOpenFilePaths: () => ({ openPaths }),
  }
})

const showErrorAlert = vi.fn((_args: { title: string; message: string }) => Promise.resolve())
vi.mock('../components/dialogs/ErrorAlertDialogProvider', () => ({
  useShowErrorAlert: () => showErrorAlert,
}))

type Api = ReturnType<typeof setupElectronAPI>

/** Install electronAPI with a SHELL_FILES_TAKE response and a capturable push. */
function setupApi(
  take: { paths: string[]; missing: string[] },
): { api: Api; firePending: () => void; unsubscribed: () => boolean } {
  let pendingCb: (() => void) | null = null
  let unsub = false
  const api = setupElectronAPI({
    invoke: vi.fn((channel: string) =>
      channel === IPC.SHELL_FILES_TAKE ? Promise.resolve(take) : Promise.resolve(undefined),
    ),
    onPush: vi.fn((channel: string, cb: () => void) => {
      if (channel === IPC.SHELL_FILES_PENDING) pendingCb = cb
      return () => {
        unsub = true
      }
    }),
  })
  return {
    api,
    firePending: () => pendingCb?.(),
    unsubscribed: () => unsub,
  }
}

function mount(opts: { cueMolReady: boolean; initialSceneSettled: boolean }) {
  return makeRenderHook(() => {
    useShellOpenFiles({ cm: {} as never, ...opts })
    return null
  })
}

/** Count of SHELL_FILES_TAKE invocations. */
function takeCalls(api: Api): number {
  return api.invoke.mock.calls.filter((c: unknown[]) => c[0] === IPC.SHELL_FILES_TAKE).length
}

describe('useShellOpenFiles', () => {
  beforeEach(() => {
    openPaths.mockClear()
    showErrorAlert.mockClear()
    resetOpenFilePathsForTests()
  })
  afterEach(() => {
    teardownElectronAPI()
    vi.restoreAllMocks()
  })

  it('does not pull before CueMol is ready', async () => {
    const { api } = setupApi({ paths: ['/a.pdb'], missing: [] })
    const handle = mount({ cueMolReady: false, initialSceneSettled: true })
    await flushPromises()

    expect(takeCalls(api)).toBe(0)
    expect(openPaths).not.toHaveBeenCalled()

    handle.unmount()
  })

  it('does not pull before the launch scene has settled', async () => {
    // Load-bearing: opening a .qsc before the initial scene exists would put
    // it in a second tab instead of loading in place.
    const { api } = setupApi({ paths: ['/a.qsc'], missing: [] })
    const handle = mount({ cueMolReady: true, initialSceneSettled: false })
    await flushPromises()

    expect(takeCalls(api)).toBe(0)
    expect(openPaths).not.toHaveBeenCalled()

    handle.unmount()
  })

  it('pulls exactly once when both gates are open and forwards the paths', async () => {
    const { api } = setupApi({ paths: ['/a.pdb', '/b.qsc'], missing: [] })
    const handle = mount({ cueMolReady: true, initialSceneSettled: true })
    await flushPromises()

    expect(takeCalls(api)).toBe(1)
    expect(openPaths).toHaveBeenCalledTimes(1)
    expect(openPaths.mock.calls[0][0]).toEqual(['/a.pdb', '/b.qsc'])
    // Must not be dropped when a dialog is already up: the request came from
    // outside the app.
    expect(openPaths.mock.calls[0][1]).toMatchObject({ policy: 'queue' })

    // A re-render must not pull again.
    handle.rerender()
    await flushPromises()
    expect(takeCalls(api)).toBe(1)

    handle.unmount()
  })

  it('pulls again on each pending ping once the gate is open', async () => {
    const { api, firePending } = setupApi({ paths: ['/a.pdb'], missing: [] })
    const handle = mount({ cueMolReady: true, initialSceneSettled: true })
    await flushPromises()
    expect(takeCalls(api)).toBe(1)

    firePending()
    await flushPromises()
    expect(takeCalls(api)).toBe(2)

    handle.unmount()
  })

  it('ignores a ping that arrives before the gate opens', async () => {
    // The queue lives in main, so the startup pull picks it up instead.
    const { api, firePending } = setupApi({ paths: ['/a.pdb'], missing: [] })
    const handle = mount({ cueMolReady: false, initialSceneSettled: false })
    await flushPromises()

    firePending()
    await flushPromises()
    expect(takeCalls(api)).toBe(0)

    handle.unmount()
  })

  it('reports missing files before opening anything', async () => {
    const order: string[] = []
    showErrorAlert.mockImplementation(() => {
      order.push('alert')
      return Promise.resolve()
    })
    openPaths.mockImplementation(() => {
      order.push('open')
      return Promise.resolve()
    })
    setupApi({ paths: ['/a.pdb'], missing: ['/gone.pdb'] })
    const handle = mount({ cueMolReady: true, initialSceneSettled: true })
    await flushPromises()

    expect(showErrorAlert).toHaveBeenCalledTimes(1)
    expect(showErrorAlert.mock.calls[0][0].message).toContain('/gone.pdb')
    expect(order).toEqual(['alert', 'open'])

    handle.unmount()
  })

  it('does nothing for an empty queue', async () => {
    setupApi({ paths: [], missing: [] })
    const handle = mount({ cueMolReady: true, initialSceneSettled: true })
    await flushPromises()

    expect(openPaths).not.toHaveBeenCalled()
    expect(showErrorAlert).not.toHaveBeenCalled()

    handle.unmount()
  })

  it('unsubscribes from the ping on unmount', async () => {
    const { unsubscribed } = setupApi({ paths: [], missing: [] })
    const handle = mount({ cueMolReady: true, initialSceneSettled: true })
    await flushPromises()

    handle.unmount()
    expect(unsubscribed()).toBe(true)
  })
})
