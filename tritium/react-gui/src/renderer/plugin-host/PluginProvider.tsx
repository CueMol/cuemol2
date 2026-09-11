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
 * The enabled set lives in electron-store (`UiState.disabledPlugins`), like
 * the other host preferences: it says something about this installation, not
 * about the scene.
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
  selectAvailablePlugins,
} from './pluginSelect'
import type { PluginContributions, RendererPlugin } from './types'

interface PluginContextValue {
  /** Every plugin this build ships, switched on or not. Settings lists these. */
  available: readonly RendererPlugin[]
  /** The plugins that are switched on right now. */
  active: readonly RendererPlugin[]
  /** The active plugins' contributions, joined with their components. */
  contributions: PluginContributions
  isEnabled: (id: string) => boolean
  setEnabled: (id: string, enabled: boolean) => void
}

const NO_PLUGINS: readonly RendererPlugin[] = []

/** Stable empty list so the initial state does not change identity per render. */
const NO_DISABLED: readonly string[] = []

/**
 * What a consumer outside a provider sees: no plugins and no way to change
 * that. Panes and the shell chrome are mounted standalone in tests, and an
 * empty registry is the honest answer there.
 */
const EMPTY_VALUE: PluginContextValue = {
  available: NO_PLUGINS,
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
  const [disabled, setDisabled] = useState<readonly string[]>(NO_DISABLED)
  const [loaded, setLoaded] = useState(false)

  // Load the persisted enabled set once. Until it arrives every plugin is on,
  // which is what a fresh profile means anyway.
  const guard = useStaleGuard()
  useEffect(() => {
    const token = guard.next()
    // Failure policy is inside: every path is caught, so the load can be
    // marked ignored rather than chained onto.
    void (async () => {
      try {
        const ui = await window.electronAPI?.invoke(IPC.UI_LOAD)
        if (!guard.isCurrent(token)) return
        if (ui?.disabledPlugins) setDisabled(ui.disabledPlugins)
      } catch {
        // Electron not available (Vite dev server) -- keep every plugin on.
      }
      if (guard.isCurrent(token)) setLoaded(true)
    })()
    return () => guard.invalidate()
  }, [guard])

  const available = useMemo(
    () => selectAvailablePlugins(plugins, __DEV_UI__),
    [plugins],
  )
  const active = useMemo(
    () => available.filter((p) => !disabled.includes(p.manifest.id)),
    [available, disabled],
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

  const setEnabled = useCallback((id: string, enabled: boolean) => {
    setDisabled((prev) => {
      const isOff = prev.includes(id)
      if (enabled === !isOff) return prev
      const next = enabled ? prev.filter((x) => x !== id) : [...prev, id]
      window.electronAPI
        ?.invoke(IPC.UI_SAVE, { disabledPlugins: [...next] })
        .catch((e: unknown) => console.error('ui:save disabledPlugins:', e))
      return next
    })
  }, [])

  const value = useMemo<PluginContextValue>(
    () => ({
      available,
      active,
      contributions,
      isEnabled: (id: string) => !disabled.includes(id),
      setEnabled,
    }),
    [available, active, contributions, disabled, setEnabled],
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
