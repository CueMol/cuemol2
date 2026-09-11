/**
 * @file plugin-host/pluginSelect.ts
 * @description Which plugins exist in this build, which are switched on, and
 * what the shell should draw for them.
 *
 * Pure functions, kept out of the provider so the gates can be tested without
 * mounting React or faking electron-store.
 */

import type {
  PluginContributions,
  RendererPlugin,
  ResolvedPluginBottomTab,
  ResolvedPluginView,
} from './types'

/**
 * The plugins this build ships.
 *
 * `devOnly` plugins are dropped from a release build. `plugins/index.ts`
 * already keeps them out of the bundle through an inline `__DEV_UI__` branch;
 * this is the second half of the same gate, and the half a test can reach.
 */
export function selectAvailablePlugins(
  plugins: readonly RendererPlugin[],
  devUi: boolean,
): RendererPlugin[] {
  return plugins.filter((p) => devUi || !p.manifest.devOnly)
}

/**
 * The user's explicit on / off choices, by plugin id.
 *
 * Only what the user actually changed: an id absent from the record has never
 * been touched, and falls back to the manifest's default. Storing the choice
 * rather than the resulting state is what lets a plugin ship default-off and
 * a later version change its own default.
 */
export type PluginChoices = Readonly<Record<string, boolean>>

/** Whether `plugin` is on, given the user's choices. */
export function isPluginEnabled(plugin: RendererPlugin, choices: PluginChoices): boolean {
  const { manifest } = plugin
  if (manifest.alwaysEnabled) return true
  return choices[manifest.id] ?? manifest.defaultEnabled ?? true
}

/** Whether the user is offered a switch for `plugin` at all. */
export function isPluginSwitchable(plugin: RendererPlugin): boolean {
  return !plugin.manifest.alwaysEnabled
}

/** The available plugins that are currently on. */
export function selectActivePlugins(
  plugins: readonly RendererPlugin[],
  choices: PluginChoices,
  devUi: boolean,
): RendererPlugin[] {
  return selectAvailablePlugins(plugins, devUi).filter((p) => isPluginEnabled(p, choices))
}

/** No contributions at all. A shared constant so identity stays stable. */
export const EMPTY_CONTRIBUTIONS: PluginContributions = {
  menus: [],
  toolbar: [],
  views: [],
  bottomTabs: [],
}

/**
 * Flatten the active plugins' contributions and join each declaration with
 * its component.
 *
 * A declaration whose component is missing is skipped here rather than
 * rendered as a hole; `validatePlugin` has already reported it.
 */
export function collectContributions(active: readonly RendererPlugin[]): PluginContributions {
  const out: PluginContributions = { menus: [], toolbar: [], views: [], bottomTabs: [] }

  for (const plugin of active) {
    const contributes = plugin.manifest.contributes
    if (!contributes) continue

    if (contributes.menus) out.menus.push(...contributes.menus)
    if (contributes.toolbar) out.toolbar.push(...contributes.toolbar)

    for (const view of contributes.views ?? []) {
      const panes = view.panes.flatMap((pane) => {
        const Component = plugin.panes?.[pane.id]
        return Component ? [{ ...pane, Component }] : []
      })
      if (panes.length === 0) continue
      const resolved: ResolvedPluginView = { ...view, panes }
      out.views.push(resolved)
    }

    for (const tab of contributes.bottomTabs ?? []) {
      const Component = plugin.bottomTabs?.[tab.id]
      if (!Component) continue
      const resolved: ResolvedPluginBottomTab = { ...tab, Component }
      out.bottomTabs.push(resolved)
    }
  }

  return out
}

/**
 * Splice `items` into `list` after the entry whose id is `after`.
 *
 * Shared by the toolbar and the bottom tab strip: both let a plugin name the
 * built-in entry it wants to sit behind, and both append when that entry is
 * not there (a built-in that moved must not take the contribution with it).
 */
export function insertAfterId<T>(
  list: readonly T[],
  items: readonly T[],
  after: string | undefined,
  idOf: (item: T) => string,
): T[] {
  if (items.length === 0) return [...list]
  const at = after ? list.findIndex((entry) => idOf(entry) === after) : -1
  if (at < 0) return [...list, ...items]
  return [...list.slice(0, at + 1), ...items, ...list.slice(at + 1)]
}
