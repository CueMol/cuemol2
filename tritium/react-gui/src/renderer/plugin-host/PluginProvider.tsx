/**
 * @file plugin-host/PluginProvider.tsx
 * @description The plugin registry the shell reads from.
 *
 * Holds which plugins exist, which of them the user has switched on, and the
 * contributions the enabled ones make. Every contribution surface -- the
 * activity bar, the sidebar, the bottom tab strip, the toolbar, the menu bar
 * and the keybinding dispatcher -- resolves through this one value, so a
 * plugin appears and disappears everywhere at once.
 *
 * What the user chose lives in electron-store (`UiState.pluginEnabled`), like
 * the other host preferences: it says something about this installation, not
 * about the scene. Only explicit choices are stored -- a plugin nobody has
 * touched takes its manifest default, and one marked `alwaysEnabled` is never
 * consulted at all.
 *
 * Menu rows are the one contribution the renderer cannot draw itself on
 * macOS, where the native menu belongs to main. The provider therefore pushes
 * the menu half over IPC whenever it changes, and main rebuilds.
 *
 * It also holds each plugin's own preferences (`UiState.pluginPrefs`), for
 * the same reason it holds the enabled set: the registry sits above both the
 * plugin Roots and the panes, which are mounted in sibling subtrees and
 * therefore cannot share a context of their own.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { IPC } from '@shared/ipcChannels'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'
import { BUILTIN_PLUGINS } from '@plugins/index'
import {
  collectContributions,
  isPluginEnabled,
  isPluginSwitchable,
  selectAvailablePlugins,
} from './pluginSelect'
import type { PluginChoices } from './pluginSelect'
import type { RendererPlugin } from './types'
import type { PluginPrefValue } from '@shared/types/uiPrefs'
import { NO_PREFS, PluginContext } from './pluginContext'
import type { PluginContextValue, PluginPrefsMap } from './pluginContext'

/** Stable empty record so the initial state does not change identity per render. */
const NO_CHOICES: PluginChoices = {}

interface PluginProviderProps {
  children: React.ReactNode
  /** Registry override. Tests pass their own plugins; the app uses the built-ins. */
  plugins?: readonly RendererPlugin[]
}

export const PluginProvider: React.FC<PluginProviderProps> = ({
  children,
  plugins = BUILTIN_PLUGINS,
}) => {
  const [choices, setChoices] = useState<PluginChoices>(NO_CHOICES)
  const [prefs, setPrefs] = useState<PluginPrefsMap>(NO_PREFS)
  const [loaded, setLoaded] = useState(false)

  // Load the persisted choices once. Until they arrive every plugin sits at
  // its own default, which is what a fresh profile means anyway.
  const guard = useStaleGuard()
  useEffect(() => {
    const token = guard.next()
    // Failure policy is inside: every path is caught, so the load can be
    // marked ignored rather than chained onto.
    void (async () => {
      try {
        const ui = await window.electronAPI?.invoke(IPC.UI_LOAD)
        if (!guard.isCurrent(token)) return
        if (ui?.pluginEnabled) setChoices(ui.pluginEnabled)
        if (ui?.pluginPrefs) setPrefs(ui.pluginPrefs)
      } catch {
        // Electron not available (Vite dev server) -- keep the defaults.
      }
      if (guard.isCurrent(token)) setLoaded(true)
    })()
    return () => guard.invalidate()
  }, [guard])

  const available = useMemo(
    () => selectAvailablePlugins(plugins, __DEV_UI__),
    [plugins],
  )
  const switchable = useMemo(() => available.filter(isPluginSwitchable), [available])
  const active = useMemo(
    () => available.filter((p) => isPluginEnabled(p, choices)),
    [available, choices],
  )
  const contributions = useMemo(() => collectContributions(active), [active])

  // Main owns the native menu and cannot see this registry, so it is told the
  // menu half every time the enabled set changes. Deferred until the stored
  // set has been read, or a plugin the user switched off would flash into the
  // menu on every launch.
  useEffect(() => {
    if (!loaded) return
    window.electronAPI
      ?.invoke(IPC.MENU_SET_PLUGIN_CONTRIBUTIONS, { menus: contributions.menus })
      .catch((e: unknown) => console.error('menu:set-plugin-contributions:', e))
  }, [loaded, contributions])

  const setEnabled = useCallback(
    (id: string, enabled: boolean) => {
      // A plugin the user is not offered a switch for must not acquire one
      // through a stale settings row or a stored choice.
      if (!switchable.some((p) => p.manifest.id === id)) return
      setChoices((prev) => {
        if (prev[id] === enabled) return prev
        const next = { ...prev, [id]: enabled }
        window.electronAPI
          ?.invoke(IPC.UI_SAVE, { pluginEnabled: next })
          .catch((e: unknown) => console.error('ui:save pluginEnabled:', e))
        return next
      })
    },
    [switchable],
  )

  // Saved as one whole map rather than per plugin: main's `saveUi` merges
  // top-level keys only, so a partial `pluginPrefs` would drop every other
  // plugin's settings. Kept in its own UI_SAVE call, separate from
  // `pluginEnabled`, so neither write can clobber the other's in-flight state.
  const setPref = useCallback(
    (pluginId: string, key: string, value: PluginPrefValue) => {
      setPrefs((prev) => {
        if (prev[pluginId]?.[key] === value) return prev
        const next = { ...prev, [pluginId]: { ...(prev[pluginId] ?? {}), [key]: value } }
        window.electronAPI
          ?.invoke(IPC.UI_SAVE, { pluginPrefs: next })
          .catch((e: unknown) => console.error('ui:save pluginPrefs:', e))
        return next
      })
    },
    [],
  )

  const value = useMemo<PluginContextValue>(
    () => ({
      available,
      switchable,
      active,
      contributions,
      isEnabled: (id: string) => active.some((p) => p.manifest.id === id),
      setEnabled,
      prefs,
      prefsLoaded: loaded,
      setPref,
    }),
    [available, switchable, active, contributions, setEnabled, prefs, loaded, setPref],
  )

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>
}
PluginProvider.displayName = 'PluginProvider'

// The hooks that read this registry live in `pluginContext`, not here: see
// that file's header for why the read path must not import this one.
export { usePluginContributions, usePlugins } from './pluginContext'
