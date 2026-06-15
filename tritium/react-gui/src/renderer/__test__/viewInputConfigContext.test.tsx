/**
 * ViewInputConfigContext wiring contract:
 *   - loads the persisted `inputDeviceMode` from UiState on mount;
 *   - `setInputDeviceMode` persists via `UI_SAVE` and re-applies the matching
 *     ViewInputConfig style via `cm.setViewInputConfigStyle` (live, no restart).
 */

import React from 'react'
import { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  mountTree,
  setupElectronAPI,
  teardownElectronAPI,
  flushPromises,
} from './helpers/testHarness'
import { IPC } from '../../shared/ipcChannels'

void React

// The context re-applies the style through the worker via useCueMol().cm.
const setStyle = vi.fn().mockResolvedValue(true)
vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cueMolReady: true, cm: { setViewInputConfigStyle: setStyle } }),
}))

import {
  ViewInputConfigProvider,
  useViewInputConfig,
} from '../contexts/ViewInputConfigContext'
import type { InputDeviceMode } from '../viewInputConfig'

function Consumer(): React.ReactElement {
  const { inputDeviceMode, setInputDeviceMode } = useViewInputConfig()
  return (
    <button data-testid="mode" onClick={() => setInputDeviceMode('trackpad')}>
      {inputDeviceMode}
    </button>
  )
}

function mountWith(loaded: InputDeviceMode): {
  api: Record<string, any>
  container: HTMLElement
  unmount: () => void
} {
  const api = setupElectronAPI({
    invoke: vi.fn((ch: string) =>
      ch === IPC.UI_LOAD
        ? Promise.resolve({ inputDeviceMode: loaded })
        : Promise.resolve(undefined),
    ),
  })
  const { container, unmount } = mountTree(
    <ViewInputConfigProvider>
      <Consumer />
    </ViewInputConfigProvider>,
  )
  return { api, container, unmount }
}

const modeText = (c: HTMLElement) =>
  c.querySelector('[data-testid="mode"]')!.textContent

describe('ViewInputConfigContext', () => {
  beforeEach(() => setStyle.mockClear())
  afterEach(() => teardownElectronAPI())

  it('loads the persisted trackpad mode on mount', async () => {
    const { container, unmount } = mountWith('trackpad')
    await flushPromises()
    expect(modeText(container)).toBe('trackpad')
    unmount()
  })

  it('persists and live-applies the chosen preset on change', async () => {
    const { api, container, unmount } = mountWith('mouse')
    await flushPromises()
    expect(modeText(container)).toBe('mouse')

    act(() => {
      ;(container.querySelector('[data-testid="mode"]') as HTMLButtonElement).click()
    })
    await flushPromises()

    expect(api.invoke).toHaveBeenCalledWith(IPC.UI_SAVE, { inputDeviceMode: 'trackpad' })
    expect(setStyle).toHaveBeenCalledWith('TrackpadViewInConf,UserViewConf')
    expect(modeText(container)).toBe('trackpad')
    unmount()
  })
})
