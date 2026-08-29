/**
 * ViewInputConfigContext wiring contract:
 *   - manual mouse/trackpad: setting the preference persists `inputDeviceMode`
 *     and re-applies the matching ViewInputConfig style live;
 *   - auto: a trackpad-like wheel (or a pinch/rotate gesture) flips the applied
 *     preset to TrackpadViewInConf and remembers the detected device;
 *   - the detector is inert unless the preference is 'auto';
 *   - the style is not re-applied redundantly for the same device.
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
import { IPC } from '@shared/ipcChannels'

void React

// The context re-applies the style through the worker via useCueMol().cm.
const setStyle = vi.fn().mockResolvedValue(true)
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cueMolReady: true, cm: { setViewInputConfigStyle: setStyle } }),
}))

import {
  ViewInputConfigProvider,
  useViewInputConfig,
} from '../contexts/ViewInputConfigContext'

const TRACKPAD_STYLE = 'TrackpadViewInConf,UserViewConf'
const MOUSE_STYLE = 'DefaultViewInConf,UserViewConf'
// Wheel samples whose classifier verdicts are unambiguous.
const TRACKPAD_WHEEL = { deltaMode: 0, deltaX: 3, deltaY: 8 }

function Consumer(): React.ReactElement {
  const {
    inputDevicePreference,
    setInputDevicePreference,
    effectiveDeviceMode,
    deviceSwitch,
    feedWheelSample,
    noteTrackpadGesture,
  } = useViewInputConfig()
  return (
    <div>
      <span data-testid="pref">{inputDevicePreference}</span>
      <span data-testid="eff">{effectiveDeviceMode}</span>
      <span data-testid="switch">{`${deviceSwitch.mode}:${deviceSwitch.seq}`}</span>
      <button data-testid="set-trackpad" onClick={() => setInputDevicePreference('trackpad')} />
      <button data-testid="set-mouse" onClick={() => setInputDevicePreference('mouse')} />
      <button data-testid="set-auto" onClick={() => setInputDevicePreference('auto')} />
      <button data-testid="feed-trackpad" onClick={() => feedWheelSample(TRACKPAD_WHEEL)} />
      <button data-testid="pinch" onClick={() => noteTrackpadGesture()} />
    </div>
  )
}

function mountWith(ui: Record<string, unknown>): {
  api: Record<string, any>
  container: HTMLElement
  unmount: () => void
} {
  const api = setupElectronAPI({
    invoke: vi.fn((ch: string) =>
      ch === IPC.UI_LOAD ? Promise.resolve(ui) : Promise.resolve(undefined),
    ),
  })
  const { container, unmount } = mountTree(
    <ViewInputConfigProvider>
      <Consumer />
    </ViewInputConfigProvider>,
  )
  return { api, container, unmount }
}

const click = (c: HTMLElement, id: string) =>
  act(() => {
    ;(c.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click()
  })
const text = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`)!.textContent

describe('ViewInputConfigContext', () => {
  beforeEach(() => setStyle.mockClear())
  afterEach(() => teardownElectronAPI())

  it('loads the persisted preference and seed on mount without re-applying', async () => {
    const { container, unmount } = mountWith({
      inputDeviceMode: 'auto',
      inputDeviceDetected: 'trackpad',
    })
    await flushPromises()
    expect(text(container, 'pref')).toBe('auto')
    expect(text(container, 'eff')).toBe('trackpad')
    // createAndInitCueMol already applied the seed; the context must not re-apply.
    expect(setStyle).not.toHaveBeenCalled()
    unmount()
  })

  it('manual: setting trackpad / mouse persists and live-applies the preset', async () => {
    const { api, container, unmount } = mountWith({ inputDeviceMode: 'auto' })
    await flushPromises()

    click(container, 'set-trackpad')
    await flushPromises()
    expect(api.invoke).toHaveBeenCalledWith(IPC.UI_SAVE, { inputDeviceMode: 'trackpad' })
    expect(setStyle).toHaveBeenCalledWith(TRACKPAD_STYLE)
    expect(text(container, 'pref')).toBe('trackpad')

    click(container, 'set-mouse')
    await flushPromises()
    expect(api.invoke).toHaveBeenCalledWith(IPC.UI_SAVE, { inputDeviceMode: 'mouse' })
    expect(setStyle).toHaveBeenCalledWith(MOUSE_STYLE)
    unmount()
  })

  it('auto: a trackpad-like wheel flips to trackpad and remembers it', async () => {
    const { api, container, unmount } = mountWith({ inputDeviceMode: 'auto' }) // seed mouse
    await flushPromises()
    expect(text(container, 'eff')).toBe('mouse')
    expect(setStyle).not.toHaveBeenCalled()

    click(container, 'feed-trackpad')
    await flushPromises()
    expect(setStyle).toHaveBeenCalledWith(TRACKPAD_STYLE)
    expect(api.invoke).toHaveBeenCalledWith(IPC.UI_SAVE, { inputDeviceDetected: 'trackpad' })
    expect(text(container, 'eff')).toBe('trackpad')
    unmount()
  })

  it('auto: a pinch gesture flips to trackpad', async () => {
    const { container, unmount } = mountWith({ inputDeviceMode: 'auto' })
    await flushPromises()
    click(container, 'pinch')
    await flushPromises()
    expect(setStyle).toHaveBeenCalledWith(TRACKPAD_STYLE)
    expect(text(container, 'eff')).toBe('trackpad')
    unmount()
  })

  it('does not re-apply the style for the same detected device twice', async () => {
    const { container, unmount } = mountWith({ inputDeviceMode: 'auto' })
    await flushPromises()
    click(container, 'feed-trackpad')
    click(container, 'feed-trackpad')
    await flushPromises()
    expect(setStyle).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('bumps deviceSwitch on a real switch, not on the startup seed', async () => {
    const { container, unmount } = mountWith({
      inputDeviceMode: 'auto',
      inputDeviceDetected: 'trackpad',
    })
    await flushPromises()
    // Seed load applies trackpad but must NOT bump the switch signal (silent launch).
    expect(text(container, 'switch')).toBe('mouse:0')

    click(container, 'set-mouse')
    await flushPromises()
    expect(text(container, 'switch')).toBe('mouse:1')
    unmount()
  })

  it('the detector is inert when the preference is not auto', async () => {
    const { container, unmount } = mountWith({ inputDeviceMode: 'auto' })
    await flushPromises()
    click(container, 'set-mouse') // preference -> mouse
    await flushPromises()
    setStyle.mockClear()

    click(container, 'feed-trackpad') // ignored: not in auto
    click(container, 'pinch')
    await flushPromises()
    expect(setStyle).not.toHaveBeenCalled()
    expect(text(container, 'eff')).toBe('mouse')
    unmount()
  })
})
