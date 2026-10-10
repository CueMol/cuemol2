/**
 * @file shell/E2eBridge.tsx
 * @description Dev-only hook surface for the UI layout inspector
 * (`e2e/inspect.mjs`), exposed as `window.__cuemolE2E`.
 *
 * Off unless the build has the developer UI (`__DEV_UI__`) AND main loaded the
 * page with `?e2e=1`, which it does only when launched with `CUEMOL_E2E=1`.
 * The bridge owns no behaviour: every entry forwards to an existing API (the
 * command bus, the theme, the plugin switches), so what the inspector sees is
 * what a user would get from the same menu or setting.
 *
 * State held by a component below this one (the sidebar's active view) is
 * reached through `useE2eHook`, which that component calls with its setter.
 */

import React, { useEffect, useRef } from 'react'
import { useCommands } from '@renderer/commands/CommandRegistry'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useTheme, type Theme } from '@renderer/contexts/ThemeContext'
import { usePluginContributions, usePlugins } from '@renderer/plugin-host'
import { BUILTIN_ACTIVITY_ITEMS } from './ActivityBar'
import { useLayout } from '@renderer/state/layout'

/** The shape published on `window.__cuemolE2E`. */
export interface CueMolE2eApi {
  /** Startup flags the inspector waits on before touching the UI. */
  status(): { cueMolReady: boolean; layoutLoaded: boolean; themeLoaded: boolean; pluginsLoaded: boolean }
  /** Dispatch a command by id without awaiting it (a dialog resolves only on close). */
  dispatch(id: string, args?: unknown): void
  /** True if a command handler is registered for id. */
  has(id: string): boolean
  setTheme(theme: Theme): void
  setPluginEnabled(id: string, enabled: boolean): void
  /** Show a sidebar view by id (`explorer`, `catalog`, ...). */
  openView(id: string): void
  /** The sidebar view ids that exist now (built-ins, then enabled plugins'). */
  views(): string[]
}

declare global {
  interface Window {
    __cuemolE2E?: CueMolE2eApi
  }
}

/** Whether this page was opened for the inspector. */
export function isE2eEnabled(): boolean {
  return __DEV_UI__ && new URLSearchParams(window.location.search).get('e2e') === '1'
}

type HookFn = (arg: string) => void
const hooks = new Map<string, HookFn>()

/**
 * Register a component-owned setter under a bridge entry name while mounted.
 * A no-op when the bridge is off.
 *
 * @param name - the bridge entry the setter backs (e.g. `openView`).
 * @param fn - the setter.
 */
export function useE2eHook(name: string, fn: HookFn): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!isE2eEnabled()) return
    const wrapped: HookFn = (arg) => ref.current(arg)
    hooks.set(name, wrapped)
    return () => {
      if (hooks.get(name) === wrapped) hooks.delete(name)
    }
  }, [name])
}

/** Publishes `window.__cuemolE2E` while mounted, when enabled. Renders nothing. */
export const E2eBridge: React.FC = () => {
  const commands = useCommands()
  const { cueMolReady } = useCueMol()
  const { loaded: layoutLoaded } = useLayout()
  const { setTheme, loaded: themeLoaded } = useTheme()
  const { setEnabled, prefsLoaded } = usePlugins()
  const { views: pluginViews } = usePluginContributions()

  // Read through a ref so the published object stays the same instance and
  // always sees the latest render's values.
  const current = { commands, cueMolReady, layoutLoaded, setTheme, themeLoaded, setEnabled, prefsLoaded, pluginViews }
  const live = useRef(current)
  live.current = current

  useEffect(() => {
    if (!isE2eEnabled()) return
    const api: CueMolE2eApi = {
      status: () => ({
        cueMolReady: live.current.cueMolReady,
        layoutLoaded: live.current.layoutLoaded,
        themeLoaded: live.current.themeLoaded,
        pluginsLoaded: live.current.prefsLoaded,
      }),
      dispatch: (id, args) => {
        live.current.commands
          .dispatchAny(id, args)
          .catch((e: unknown) => console.error('[E2eBridge] dispatch', id, e))
      },
      has: (id) => live.current.commands.has(id),
      setTheme: (t) => live.current.setTheme(t),
      setPluginEnabled: (id, on) => live.current.setEnabled(id, on),
      openView: (id) => {
        const fn = hooks.get('openView')
        if (!fn) throw new Error('[E2eBridge] openView is not registered')
        fn(id)
      },
      views: () => [
        ...BUILTIN_ACTIVITY_ITEMS.map((item) => item.id),
        ...live.current.pluginViews.map((view) => view.id),
      ],
    }
    window.__cuemolE2E = api
    return () => {
      if (window.__cuemolE2E === api) delete window.__cuemolE2E
    }
  }, [])

  return null
}
