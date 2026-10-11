/**
 * @file __test__/updateFlow.test.tsx
 * @description The app update UI's contracts: the notification list's
 * hide / close rules, and which surface (notifications or the Settings row)
 * a status from main is shown on.
 *
 * The restart case pins a bug that shipped once: driven from Settings, the
 * flow raised no notification and therefore never reached the "unpacked ->
 * restart" step, leaving the user to press Restart a second time.
 */

import React from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/ipcChannels'
import type { UpdateRelease, UpdateStatus } from '@shared/types/update'
import {
  INITIAL_NOTIFICATION_STATE,
  notificationReducer,
} from '@renderer/shell/notifications/notificationStore'
import { NotificationProvider, useNotifications } from '@renderer/shell/notifications'
import { CommandProvider } from '@renderer/commands/CommandRegistry'
import { UpdateConfirmDialogProvider } from '@renderer/features/update/UpdateConfirmDialog'
import { UpdateBridge } from '@renderer/features/update/UpdateBridge'
import { setUpdateOrigin } from '@renderer/features/update/updateOrigin'
import { flushPromises, mountTree, setupElectronAPI, teardownElectronAPI } from './helpers/testHarness'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('notification list', () => {
  it('keeps a hidden or pending notification in the center; closes only the rest', () => {
    let s = notificationReducer(INITIAL_NOTIFICATION_STATE, { type: 'add', input: { severity: 'info', message: 'done' } })
    s = notificationReducer(s, { type: 'add', input: { severity: 'info', message: 'pending', persistent: true } })
    s = notificationReducer(s, { type: 'add', input: { severity: 'info', message: 'busy', progress: { fraction: 0.5 } } })
    const [done, pending, busy] = s.items.map((n) => n.id)

    // Hidden: off screen, still listed and unread (the bell's dot).
    s = notificationReducer(s, { type: 'hide', id: done })
    expect(s.items.find((n) => n.id === done)).toMatchObject({ toast: false, unread: true })

    // Close and Clear All leave what stands for pending work.
    s = notificationReducer(s, { type: 'close', id: pending })
    s = notificationReducer(s, { type: 'close', id: busy })
    expect(s.items.map((n) => n.id)).toEqual([done, pending, busy])
    s = notificationReducer(s, { type: 'clearAll' })
    expect(s.items.map((n) => n.id)).toEqual([pending, busy])

    // Opening the center shows everything there: nothing left unread.
    s = notificationReducer(s, { type: 'setCenter', open: true })
    expect(s.items.some((n) => n.unread || n.toast)).toBe(false)
  })
})

const RELEASE: UpdateRelease = {
  version: '2.3.22.550', htmlUrl: 'https://example.invalid/r', notes: '',
  asset: { name: 'a.dmg', url: '', size: 10, digest: 'sha256:00' },
}
const base: UpdateStatus = { supported: true, current: '2.3.21.544', canInstall: true, state: { phase: 'idle' } }

describe('update status -> surface', () => {
  let push: (s: UpdateStatus) => void
  let api: Record<string, any>
  let shown = 0
  const Probe: React.FC = () => {
    shown = useNotifications().items.length
    return null
  }

  beforeEach(() => {
    api = setupElectronAPI({
      invoke: vi.fn(async (channel: string) => (channel === IPC.UPDATE_GET_STATUS ? base : undefined)),
      onPush: (_channel: string, cb: (s: UpdateStatus) => void) => { push = cb; return () => undefined },
    })
  })
  afterEach(() => {
    teardownElectronAPI()
    setUpdateOrigin('notification')
  })

  function mount() {
    return mountTree(
      <CommandProvider>
        <NotificationProvider>
          <UpdateConfirmDialogProvider>
            <UpdateBridge />
            <Probe />
          </UpdateConfirmDialogProvider>
        </NotificationProvider>
      </CommandProvider>,
    )
  }

  it('announces an update found by the startup check as a notification', async () => {
    const t = mount()
    await flushPromises()
    act(() => push({ ...base, state: { phase: 'available', release: RELEASE } }))
    expect(shown).toBe(1)
    t.unmount()
  })

  it('driven from Settings: no notification, and the restart follows the unpack', async () => {
    const t = mount()
    await flushPromises()
    setUpdateOrigin('settings')
    for (const state of [
      { phase: 'available', release: RELEASE },
      { phase: 'downloading', release: RELEASE, received: 5, total: 10 },
      { phase: 'downloaded', release: RELEASE },
      { phase: 'installing', release: RELEASE, step: 'copy', fraction: 1 },
      { phase: 'readyToRestart', release: RELEASE },
    ] as UpdateStatus['state'][]) {
      act(() => push({ ...base, state }))
    }
    expect(shown).toBe(0)
    expect(api.invoke.mock.calls.map((c: unknown[]) => c[0])).toContain(IPC.UPDATE_RESTART)
    t.unmount()
  })
})
