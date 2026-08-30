/**
 * Degrade-detection tests for the modal-aware menu accelerator block.
 *
 * Pinned contract:
 *   1. `useDialogFactory` Provider increments the modal counter when
 *      `visible` becomes true and decrements on close / unmount.
 *   2. The 0 -> 1 / 1 -> 0 boundaries fire `MENU_SET_MODAL_BLOCKED` to main;
 *      stacking dialogs (1 -> 2, 2 -> 1) does NOT re-fire the IPC.
 *   3. Dialogs still work when no `ModalOpenCounterProvider` is mounted (the
 *      counter hook returns null and the factory tolerates it).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cueMolReady: false, cm: null }),
}))

import { IPC } from '@shared/ipcChannels'
import {
  ModalOpenCounterProvider,
  ModalOpenCounterTestProvider,
} from '@renderer/contexts/ModalOpenCounterContext'
import { createDialogHook } from '@renderer/hooks/useDialogFactory'
import {
  mountTree,
  flushPromises,
  setupElectronAPI,
  teardownElectronAPI,
} from '@renderer/__test__/helpers/testHarness'

void React

// Build a trivial dialog hook for tests so we don't depend on the real ones.
function makeTestDialog() {
  return createDialogHook<void, string>({
    name: 'TestDialog',
    render: ({ visible, resolve }) =>
      visible
        ? React.createElement(
            'div',
            null,
            React.createElement(
              'button',
              { 'data-testid': 'tdlg-ok', onClick: () => resolve('ok') },
              'OK',
            ),
          )
        : null,
  })
}

function findOk(container: ParentNode): HTMLButtonElement {
  const btn = container.querySelector('[data-testid="tdlg-ok"]') as HTMLButtonElement | null
  if (!btn) throw new Error('OK button not found')
  return btn
}

describe('Modal-aware menu accelerator block', () => {
  let api: ReturnType<typeof setupElectronAPI>

  beforeEach(() => {
    api = setupElectronAPI()
  })
  afterEach(() => {
    teardownElectronAPI()
    vi.restoreAllMocks()
  })

  it('Provider increments / decrements counter on visible change', async () => {
    const inc = vi.fn()
    const dec = vi.fn()
    const Dlg = makeTestDialog()

    let show!: () => Promise<string>
    const Probe: React.FC = () => {
      show = Dlg.useShow() as unknown as () => Promise<string>
      return null
    }

    const tree = React.createElement(
      ModalOpenCounterTestProvider as React.FC<{
        value: { inc: () => void; dec: () => void }
        children?: React.ReactNode
      }>,
      { value: { inc, dec } },
      React.createElement(
        Dlg.Provider,
        null,
        React.createElement(Probe),
      ),
    )
    const handle = mountTree(tree)

    expect(inc).not.toHaveBeenCalled()
    expect(dec).not.toHaveBeenCalled()

    const p = show()
    await flushPromises()
    expect(inc).toHaveBeenCalledTimes(1)
    expect(dec).not.toHaveBeenCalled()

    findOk(document.body).click()
    expect(await p).toBe('ok')
    await flushPromises()
    expect(dec).toHaveBeenCalledTimes(1)

    handle.unmount()
  })

  it('IPC fires only on 0<->1 boundaries, not on 1<->2 stacking', async () => {
    const A = makeTestDialog()
    const B = makeTestDialog()

    let showA!: () => Promise<string>
    let showB!: () => Promise<string>
    const Probe: React.FC = () => {
      showA = A.useShow() as unknown as () => Promise<string>
      showB = B.useShow() as unknown as () => Promise<string>
      return null
    }

    const tree = React.createElement(
      ModalOpenCounterProvider,
      null,
      React.createElement(
        A.Provider,
        null,
        React.createElement(
          B.Provider,
          null,
          React.createElement(Probe),
        ),
      ),
    )
    const handle = mountTree(tree)

    const blockCalls = () =>
      api.invoke.mock.calls.filter((c: unknown[]) => c[0] === IPC.MENU_SET_MODAL_BLOCKED)

    // 0 -> 1
    const pA = showA()
    await flushPromises()
    expect(blockCalls()).toEqual([[IPC.MENU_SET_MODAL_BLOCKED, true]])

    // 1 -> 2 (no new IPC)
    const pB = showB()
    await flushPromises()
    expect(blockCalls()).toEqual([[IPC.MENU_SET_MODAL_BLOCKED, true]])

    // 2 -> 1 (no new IPC)
    findOk(document.body).click()
    await pB
    await flushPromises()
    expect(blockCalls()).toEqual([[IPC.MENU_SET_MODAL_BLOCKED, true]])

    // 1 -> 0
    findOk(document.body).click()
    await pA
    await flushPromises()
    expect(blockCalls()).toEqual([
      [IPC.MENU_SET_MODAL_BLOCKED, true],
      [IPC.MENU_SET_MODAL_BLOCKED, false],
    ])

    handle.unmount()
  })

  it('Dialog still works without ModalOpenCounterProvider', async () => {
    const Dlg = makeTestDialog()

    let show!: () => Promise<string>
    const Probe: React.FC = () => {
      show = Dlg.useShow() as unknown as () => Promise<string>
      return null
    }

    const tree = React.createElement(
      Dlg.Provider,
      null,
      React.createElement(Probe),
    )
    const handle = mountTree(tree)

    const p = show()
    await flushPromises()
    findOk(document.body).click()
    expect(await p).toBe('ok')

    // No MENU_SET_MODAL_BLOCKED IPC should have been emitted.
    const blockCalls = api.invoke.mock.calls.filter(
      (c: unknown[]) => c[0] === IPC.MENU_SET_MODAL_BLOCKED,
    )
    expect(blockCalls).toEqual([])

    handle.unmount()
  })
})
