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
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { IPC } from '@shared/ipcChannels'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'
import { BUILTIN_PLUGINS } from '@plugins/index'
import {
  EMPTY_CONTRIBUTIONS,
  collectContributions,
  isPluginEnabled,
  isPluginSwitchable,
  selectAvailablePlugins,
} from './pluginSelect'
import type { PluginChoices } from './pluginSelect'
import type { PluginContributions, RendererPlugin } from './types'

interface PluginContextValue {
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
}

const NO_PLUGINS: readonly RendererPlugin[] = []

/** Stable empty record so the initial state does not change identity per render. */
const NO_CHOICES: PluginChoices = {}

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
}

const PluginContext = createContext<PluginContextValue | null>(null)

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

  const value = useMemo<PluginContextValue>(
    () => ({
      available,
      switchable,
      active,
      contributions,
      isEnabled: (id: string) => active.some((p) => p.manifest.id === id),
      setEnabled,
    }),
    [available, switchable, active, contributions, setEnabled],
  )

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>
}
PluginProvider.displayName = 'PluginProvider'

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
