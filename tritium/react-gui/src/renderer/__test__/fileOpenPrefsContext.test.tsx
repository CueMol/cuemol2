/**
 * The file-open target preferences: where they are read, how they are written,
 * and -- the load-bearing part -- that the shell getter always settles.
 *
 * `useShellOpenFiles` drains the launch queue as soon as CueMol and the launch
 * scene are ready, which is not ordered against the UI_LOAD round trip. It
 * therefore awaits `getShellTarget()`, so that promise must resolve even when
 * the load fails outright, or a file named on the command line would be
 * stranded for the rest of the session.
 */

import React from 'react'
import { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IPC } from '@shared/ipcChannels'
import {
  FileOpenPrefsProvider,
  useFileOpenPrefs,
} from '@renderer/contexts/FileOpenPrefsContext'
import {
  mountTree,
  flushPromises,
  setupElectronAPI,
  teardownElectronAPI,
} from '@renderer/__test__/helpers/testHarness'

void React

let api: ReturnType<typeof setupElectronAPI>
let ctx: ReturnType<typeof useFileOpenPrefs> | null = null

function Probe(): React.JSX.Element {
  ctx = useFileOpenPrefs()
  return <div />
}

function mount() {
  return mountTree(
    <FileOpenPrefsProvider>
      <Probe />
    </FileOpenPrefsProvider>,
  )
}

beforeEach(() => {
  ctx = null
})
afterEach(() => teardownElectronAPI())

describe('FileOpenPrefsProvider', () => {
  it('reads both targets from the store on mount', async () => {
    api = setupElectronAPI({
      invoke: vi.fn((ch: string) =>
        ch === IPC.UI_LOAD
          ? Promise.resolve({ dropOpenTarget: 'new', shellOpenTarget: 'active' })
          : Promise.resolve(undefined),
      ),
    })
    const { unmount } = mount()
    await flushPromises()

    expect(ctx!.dropTarget).toBe('new')
    expect(ctx!.shellTarget).toBe('active')
    unmount()
  })

  it('persists a change as a single-key patch', async () => {
    api = setupElectronAPI({ invoke: vi.fn(() => Promise.resolve(undefined)) })
    const { unmount } = mount()
    await flushPromises()

    act(() => ctx!.setDropTarget('new'))
    await flushPromises()

    // One key only: main merges the patch over the stored ui object, so a
    // narrow write cannot clobber the shell target or any other preference.
    expect(api.invoke).toHaveBeenCalledWith(IPC.UI_SAVE, { dropOpenTarget: 'new' })
    unmount()
  })

  it('resolves getShellTarget even when the load fails', async () => {
    api = setupElectronAPI({
      invoke: vi.fn((ch: string) =>
        ch === IPC.UI_LOAD ? Promise.reject(new Error('store unreadable')) : Promise.resolve(undefined),
      ),
    })
    const { unmount } = mount()
    await flushPromises()

    await expect(ctx!.getShellTarget()).resolves.toBe('active')
    unmount()
  })
})
