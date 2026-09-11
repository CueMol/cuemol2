/**
 * @file plugin-host/PluginProvider.test.tsx
 * @description What the plugin registry persists, and what a release build
 * is allowed to contain.
 *
 * Two contracts worth pinning. The enabled set is stored as the exception
 * (`UiState.disabledPlugins`), so a plugin added later starts out on; getting
 * that inverted would silently switch every plugin off on upgrade. And the
 * `devOnly` gate is what keeps the Component Catalog out of a shipped build,
 * which the compile-time `__DEV_UI__` branch alone cannot be tested for.
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
import { selectActivePlugins, selectAvailablePlugins } from './pluginSelect'
import type { RendererPlugin } from './types'

void React

const plugin = (id: string, devOnly = false): RendererPlugin => ({
  manifest: { id, name: id, version: '1.0.0', ...(devOnly ? { devOnly: true } : {}) },
})

const PLUGINS = [plugin('alpha'), plugin('beta')]

/** Mount the registry with `PLUGINS` and return its context value. */
function mountRegistry() {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <PluginProvider plugins={PLUGINS}>{children}</PluginProvider>
  )
  return makeRenderHook(() => usePlugins(), Wrapper)
}

describe('plugin selection gates', () => {
  it('drops a devOnly plugin from a release build', () => {
    const all = [plugin('alpha'), plugin('catalog', true)]
    expect(selectAvailablePlugins(all, true).map((p) => p.manifest.id)).toEqual([
      'alpha',
      'catalog',
    ])
    expect(selectAvailablePlugins(all, false).map((p) => p.manifest.id)).toEqual(['alpha'])
    // The disabled list cannot resurrect one either.
    expect(selectActivePlugins(all, [], false).map((p) => p.manifest.id)).toEqual(['alpha'])
  })
})

describe('PluginProvider', () => {
  let api: ReturnType<typeof setupElectronAPI>

  beforeEach(() => {
    api = setupElectronAPI({
      invoke: vi.fn((channel: string) =>
        channel === IPC.UI_LOAD
          ? Promise.resolve({ disabledPlugins: ['beta'] })
          : Promise.resolve(undefined),
      ) as unknown as ReturnType<typeof setupElectronAPI>['invoke'],
    })
  })
  afterEach(() => teardownElectronAPI())

  it('switches off the plugins the stored preference names', async () => {
    const h = mountRegistry()
    await flushPromises()

    expect(h.result.available.map((p) => p.manifest.id)).toEqual(['alpha', 'beta'])
    expect(h.result.active.map((p) => p.manifest.id)).toEqual(['alpha'])
    expect(h.result.isEnabled('beta')).toBe(false)
    h.unmount()
  })

  it('persists a switch as the disabled set, and pushes the menu rows to main', async () => {
    const h = mountRegistry()
    await flushPromises()
    api.invoke.mockClear()

    await act(async () => {
      h.result.setEnabled('alpha', false)
    })
    await flushPromises()

    expect(api.invoke).toHaveBeenCalledWith(IPC.UI_SAVE, {
      disabledPlugins: ['beta', 'alpha'],
    })
    // Main owns the native menu and has to be told what is left.
    expect(api.invoke).toHaveBeenCalledWith(IPC.MENU_SET_PLUGIN_CONTRIBUTIONS, { menus: [] })
    h.unmount()
  })
})
