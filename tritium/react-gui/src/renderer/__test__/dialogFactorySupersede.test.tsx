/**
 * @file __test__/dialogFactorySupersede.test.tsx
 * @description Pins that a second show() settles the first caller's promise.
 *
 * `show()` stores the resolver in a ref. A second call while one dialog is
 * still open overwrote it, so the first caller's `await` never settled.
 *
 * That is not hypothetical: useShellOpenFiles awaits showErrorAlert() for
 * missing paths *outside* the useOpenFilePaths module mutex, so two Finder
 * "Open With" invocations in quick succession left the first drain parked on
 * the alert forever -- and the files it was holding were never opened. The
 * same shape hangs App.confirmCloseTab when a tab close and the window-close
 * sweep overlap.
 */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { makeRenderHook, flushPromises } from '@renderer/__test__/helpers/testHarness'
import { createDialogHook, createConfirmCancelDialog } from '@renderer/hooks/useDialogFactory'

void React

describe('createDialogHook supersede semantics', () => {
  it('settles the first promise with undefined by default', async () => {
    const { Provider, useShow } = createDialogHook<void, string | undefined>({
      name: 'Plain',
      render: () => null,
    })
    const h = makeRenderHook(() => useShow(), ({ children }) => (
      <Provider>{children}</Provider>
    ))

    let first: string | undefined | 'PENDING' = 'PENDING'
    void h.result().then((r) => { first = r })
    void h.result()
    await flushPromises()

    expect(first).toBeUndefined()
    h.unmount()
  })

  it('settles the first promise with the configured superseded result', async () => {
    const { Provider, useShow } = createDialogHook<void, 'yes' | 'cancel'>({
      name: 'Explicit',
      render: () => null,
      supersededResult: 'cancel',
    })
    const h = makeRenderHook(() => useShow(), ({ children }) => (
      <Provider>{children}</Provider>
    ))

    let first: string | 'PENDING' = 'PENDING'
    void h.result().then((r) => { first = r })
    void h.result()
    await flushPromises()

    expect(first).toBe('cancel')
    h.unmount()
  })

  it('a confirm/cancel dialog supersedes as a cancel (null)', async () => {
    const Dummy: React.FC<{ visible: boolean }> = () => null
    const { Provider, useShow } = createConfirmCancelDialog<
      Record<string, never>,
      { picked: string }
    >({ name: 'Confirmish', component: Dummy as never })
    const h = makeRenderHook(() => useShow(), ({ children }) => (
      <Provider>{children}</Provider>
    ))

    let first: unknown = 'PENDING'
    void h.result({}).then((r) => { first = r })
    void h.result({})
    await flushPromises()

    expect(first).toBeNull()
    h.unmount()
  })

  it('the surviving dialog still resolves normally', async () => {
    let resolveFn: ((v: string) => void) | null = null
    const { Provider, useShow } = createDialogHook<void, string>({
      name: 'Survivor',
      render: ({ resolve }) => { resolveFn = resolve; return null },
    })
    const h = makeRenderHook(() => useShow(), ({ children }) => (
      <Provider>{children}</Provider>
    ))

    void h.result()
    const second = h.result()
    await flushPromises()
    resolveFn!('answered')
    await expect(second).resolves.toBe('answered')
    h.unmount()
  })
})
