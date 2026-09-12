/**
 * @file plugin-host/pluginContext.ts
 * @description The registry context, and the hooks that read it.
 *
 * Split from `PluginProvider` so that reading the registry does not drag in
 * the registry's CONTENTS. The provider imports `@plugins/index`, and every
 * plugin imports the host through `plugin-host/api`; a hook re-exported from
 * that barrel would close the loop (plugin -> api -> provider -> registry ->
 * plugin) and leave whichever module the bundler evaluated first holding
 * undefined imports.
 *
 * This file is the shape of the value and the way to read it. The provider
 * owns the value itself.
 */

import { createContext, useContext } from 'react'
import type { PluginContributions, RendererPlugin } from './types'
import type { PluginPrefValue } from '@shared/types/uiPrefs'
import { EMPTY_CONTRIBUTIONS } from './pluginSelect'

/** Every plugin's stored preferences, by plugin id then setting key. */
export type PluginPrefsMap = Record<string, Record<string, PluginPrefValue>>

export interface PluginContextValue {
  /** Every plugin this build ships, switched on or not. */
  available: readonly RendererPlugin[]
  /** The ones the user can switch. Settings lists exactly these. */
  switchable: readonly RendererPlugin[]
  /** The plugins that are switched on right now. */
  active: readonly RendererPlugin[]
  /** The active plugins' contributions, joined with their components. */
  contributions: PluginContributions
  isEnabled: (id: string) => boolean
  /** No-op for a plugin that is not switchable. */
  setEnabled: (id: string, enabled: boolean) => void
  /** Stored plugin preferences. An absent key takes the manifest default. */
  prefs: PluginPrefsMap
  /** Whether the stored preferences have been read yet. */
  prefsLoaded: boolean
  /** Write one plugin preference through to electron-store. */
  setPref: (pluginId: string, key: string, value: PluginPrefValue) => void
}

const NO_PLUGINS: readonly RendererPlugin[] = []

/** Stable empty record so the initial state does not change identity per render. */
export const NO_PREFS: PluginPrefsMap = {}

/**
 * What a consumer outside a provider sees: no plugins and no way to change
 * that. Panes and the shell chrome are mounted standalone in tests, and an
 * empty registry is the honest answer there.
 */
const EMPTY_VALUE: PluginContextValue = {
  available: NO_PLUGINS,
  switchable: NO_PLUGINS,
  active: NO_PLUGINS,
  contributions: EMPTY_CONTRIBUTIONS,
  isEnabled: () => true,
  setEnabled: () => undefined,
  prefs: NO_PREFS,
  prefsLoaded: false,
  setPref: () => undefined,
}

/** Filled in by `PluginProvider`; read through the hooks below. */
export const PluginContext = createContext<PluginContextValue | null>(null)
PluginContext.displayName = 'PluginContext'

/**
 * The plugin registry. Outside a provider this reports an empty registry
 * rather than throwing, so a pane or a chrome component can still be mounted
 * on its own.
 */
export function usePlugins(): PluginContextValue {
  return useContext(PluginContext) ?? EMPTY_VALUE
}

/** Just the contributions, for the shell surfaces that only draw them. */
export function usePluginContributions(): PluginContributions {
  return usePlugins().contributions
}
