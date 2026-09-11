/**
 * @file plugin-host/PluginProvider.test.tsx
 * @description Which plugins are on, and which of them the user may change.
 *
 * Three contracts worth pinning. Only explicit choices are stored, so a
 * plugin nobody has touched keeps its own default -- getting that wrong makes
 * a default-off plugin appear on upgrade, or silently overrides a default the
 * plugin changes later. An `alwaysEnabled` plugin is on and has no switch,
 * including through a stale stored choice. And the `devOnly` gate is what
 * keeps the Component Catalog out of a shipped build, which the compile-time
 * `__DEV_UI__` branch alone cannot be tested for.
 */

import React, { act } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { IPC } from '@shared/ipcChannels'
import {
  makeRenderHook,
  setupElectronAPI,
  teardownElectronAPI,
  flushPromises,
} from '@renderer/__test__/helpers/testHarness'
import { PluginProvider, usePlugins } from './PluginProvider'
import { isPluginEnabled, selectActivePlugins, selectAvailablePlugins } from './pluginSelect'
import type { RendererPlugin } from './types'

void React

type Switchability = { devOnly?: boolean; alwaysEnabled?: boolean; defaultEnabled?: boolean }

const plugin = (id: string, how: Switchability = {}): RendererPlugin => ({
  manifest: { id, name: id, version: '1.0.0', ...how },
})

/** One of each: switchable-on-by-default, opt-in, and not switchable. */
const PLUGINS = [
  plugin('alpha'),
  plugin('optin', { defaultEnabled: false }),
  plugin('fixed', { alwaysEnabled: true }),
]

/** Mount the registry with `PLUGINS` and return its context value. */
function mountRegistry() {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <PluginProvider plugins={PLUGINS}>{children}</PluginProvider>
  )
  return makeRenderHook(() => usePlugins(), Wrapper)
}

const ids = (plugins: readonly RendererPlugin[]): string[] => plugins.map((p) => p.manifest.id)

describe('plugin enabled state', () => {
  it('falls back to the manifest default until the user chooses', () => {
    expect(isPluginEnabled(plugin('a'), {})).toBe(true)
    expect(isPluginEnabled(plugin('a', { defaultEnabled: false }), {})).toBe(false)
    // An explicit choice wins over the default, in both directions.
    expect(isPluginEnabled(plugin('a'), { a: false })).toBe(false)
    expect(isPluginEnabled(plugin('a', { defaultEnabled: false }), { a: true })).toBe(true)
  })

  it('keeps an alwaysEnabled plugin on whatever is stored for it', () => {
    expect(isPluginEnabled(plugin('a', { alwaysEnabled: true }), { a: false })).toBe(true)
  })

  it('drops a devOnly plugin from a release build', () => {
    const all = [plugin('alpha'), plugin('catalog', { devOnly: true })]
    expect(ids(selectAvailablePlugins(all, true))).toEqual(['alpha', 'catalog'])
    expect(ids(selectAvailablePlugins(all, false))).toEqual(['alpha'])
    // A stored choice cannot resurrect one either.
    expect(ids(selectActivePlugins(all, { catalog: true }, false))).toEqual(['alpha'])
  })
})

describe('PluginProvider', () => {
  let api: ReturnType<typeof setupElectronAPI>

  /** Mount over the given stored choices. */
  function withStored(pluginEnabled: Record<string, boolean>) {
    api = setupElectronAPI({
      invoke: vi.fn((channel: string) =>
        channel === IPC.UI_LOAD ? Promise.resolve({ pluginEnabled }) : Promise.resolve(undefined),
      ) as unknown as ReturnType<typeof setupElectronAPI>['invoke'],
    })
    return mountRegistry()
  }

  beforeEach(() => {
    api = setupElectronAPI()
  })
  afterEach(() => teardownElectronAPI())

  it('offers a switch for every plugin except the always-on ones', async () => {
    const h = withStored({})
    await flushPromises()

    expect(ids(h.result.available)).toEqual(['alpha', 'optin', 'fixed'])
    expect(ids(h.result.switchable)).toEqual(['alpha', 'optin'])
    // Defaults: alpha on, optin off, fixed on because it cannot be off.
    expect(ids(h.result.active)).toEqual(['alpha', 'fixed'])
    h.unmount()
  })

  it('applies the stored choices, and ignores one for an always-on plugin', async () => {
    const h = withStored({ alpha: false, optin: true, fixed: false })
    await flushPromises()

    expect(ids(h.result.active)).toEqual(['optin', 'fixed'])
    h.unmount()
  })

  it('persists a switch as an explicit choice, and pushes the menu rows to main', async () => {
    const h = withStored({})
    await flushPromises()
    api.invoke.mockClear()

    await act(async () => {
      h.result.setEnabled('optin', true)
    })
    await flushPromises()

    expect(api.invoke).toHaveBeenCalledWith(IPC.UI_SAVE, { pluginEnabled: { optin: true } })
    // Main owns the native menu and has to be told what is left.
    expect(api.invoke).toHaveBeenCalledWith(IPC.MENU_SET_PLUGIN_CONTRIBUTIONS, { menus: [] })
    expect(ids(h.result.active)).toEqual(['alpha', 'optin', 'fixed'])
    h.unmount()
  })

  it('will not switch an always-on plugin off', async () => {
    const h = withStored({})
    await flushPromises()
    api.invoke.mockClear()

    await act(async () => {
      h.result.setEnabled('fixed', false)
    })
    await flushPromises()

    expect(api.invoke).not.toHaveBeenCalledWith(IPC.UI_SAVE, expect.anything())
    expect(h.result.isEnabled('fixed')).toBe(true)
    h.unmount()
  })
})
