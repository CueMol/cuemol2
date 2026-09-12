/**
 * @file plugin-host/usePluginPrefs.ts
 * @description One plugin's own preferences, read and written by that plugin.
 *
 * The registry stores them (`UiState.pluginPrefs`, via `PluginProvider`);
 * this hook narrows the map to one plugin and layers the manifest defaults
 * underneath, so a plugin declares each default exactly once -- in the
 * `contributes.settings` row the Settings pane also draws from -- and never
 * has to repeat it at the read site.
 *
 * A secret is not a preference: it is declared with the `secret` control
 * kind, never carries a `default`, and is read through `definePluginSecret`.
 * It therefore never appears in the values this hook returns.
 */

import { useMemo } from 'react'
import type { PluginPrefValue } from '@shared/types/uiPrefs'
import { usePlugins } from './pluginContext'

/** One plugin's preferences, with its manifest defaults already applied. */
export interface PluginPrefs {
  /** Declared defaults, overridden by whatever the user has changed. */
  prefs: Readonly<Record<string, PluginPrefValue>>
  /** Write one value through to electron-store. */
  setPref: (key: string, value: PluginPrefValue) => void
  /** False until the stored values have been read; the defaults apply until then. */
  loaded: boolean
}

/**
 * The preferences of `pluginId`.
 *
 * @param pluginId - the manifest id. An unknown id yields the stored values
 *   alone, which is the honest answer outside a provider.
 */
export function usePluginPrefs(pluginId: string): PluginPrefs {
  const { available, prefs, prefsLoaded, setPref } = usePlugins()

  const defaults = useMemo(() => {
    const manifest = available.find((p) => p.manifest.id === pluginId)?.manifest
    const out: Record<string, PluginPrefValue> = {}
    for (const decl of manifest?.contributes?.settings ?? []) {
      if (decl.default !== undefined) out[decl.key] = decl.default
    }
    return out
  }, [available, pluginId])

  const stored = prefs[pluginId]

  return useMemo(
    () => ({
      prefs: { ...defaults, ...stored },
      setPref: (key: string, value: PluginPrefValue) => { setPref(pluginId, key, value) },
      loaded: prefsLoaded,
    }),
    [defaults, stored, prefsLoaded, setPref, pluginId],
  )
}
