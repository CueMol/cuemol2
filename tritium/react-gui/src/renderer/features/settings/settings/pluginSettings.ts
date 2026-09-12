/**
 * @file features/settings/settings/pluginSettings.ts
 * @description The Plugins branch of the Settings pane: the on / off switches,
 * and each enabled plugin's own settings page.
 *
 * Both are generated from the registry rather than listed by hand, so a
 * plugin appears here by existing (the switch) and by declaring
 * `contributes.settings` (its page). The rows are `SettingDef`s like every
 * other setting, but their values do not live in `UiState` under their own
 * keys -- `SettingsPane` routes them to the plugin registry, which owns the
 * enabled set and the per-plugin preferences.
 *
 * Two key spaces, deliberately distinct so one routing test cannot match the
 * other:
 *
 *   plugins.<id>          the enabled switch          -> setEnabled
 *   plugin.<id>.<key>     a contributed setting row   -> setPref
 *
 * Only switchable plugins get a switch: one marked `alwaysEnabled` is not
 * optional, and a switch that cannot move is worse than no switch. Only
 * ENABLED plugins contribute settings rows, because a disabled plugin's
 * contributions are not collected at all -- so its page disappears with it.
 */

import type { RendererPlugin, ResolvedPluginSetting } from '@renderer/plugin-host'
import type { CategoryNode, SettingDef } from './settingsConfig'

/** Category id of the plugin switches page. */
export const PLUGINS_CATEGORY = 'plugins.installed'

/** Category id of the branch both plugin pages hang off. */
export const PLUGINS_PARENT_CATEGORY = 'plugins'

/** Prefix marking a setting key that addresses a plugin's enabled flag. */
export const PLUGIN_SETTING_PREFIX = 'plugins.'

/** Prefix marking a setting key that addresses one of a plugin's own preferences. */
export const PLUGIN_PREF_SETTING_PREFIX = 'plugin.'

/** The plugin id a `plugins.<id>` key addresses, or null for any other key. */
export function pluginIdFromSettingKey(key: string): string | null {
  if (!key.startsWith(PLUGIN_SETTING_PREFIX)) return null
  return key.slice(PLUGIN_SETTING_PREFIX.length)
}

/** The plugin and preference a `plugin.<id>.<key>` key addresses, or null. */
export function pluginPrefFromSettingKey(
  key: string,
): { pluginId: string; prefKey: string } | null {
  if (!key.startsWith(PLUGIN_PREF_SETTING_PREFIX)) return null
  const rest = key.slice(PLUGIN_PREF_SETTING_PREFIX.length)
  const dot = rest.indexOf('.')
  if (dot <= 0 || dot === rest.length - 1) return null
  return { pluginId: rest.slice(0, dot), prefKey: rest.slice(dot + 1) }
}

/** The settings key of one contributed row. */
export function pluginPrefSettingKey(pluginId: string, prefKey: string): string {
  return `${PLUGIN_PREF_SETTING_PREFIX}${pluginId}.${prefKey}`
}

/** The category id of one plugin's settings page. */
export function pluginSettingCategory(pluginId: string): string {
  return `${PLUGIN_SETTING_PREFIX}${pluginId}`
}

/**
 * One toggle row per plugin, in registry order.
 *
 * @param plugins - the switchable plugins (`usePlugins().switchable`).
 */
export function pluginSettingDefs(plugins: readonly RendererPlugin[]): SettingDef[] {
  return plugins.map((plugin) => ({
    key: `${PLUGIN_SETTING_PREFIX}${plugin.manifest.id}`,
    label: plugin.manifest.name,
    description:
      plugin.manifest.description ??
      `Enable the ${plugin.manifest.name} plugin.`,
    category: PLUGINS_CATEGORY,
    control: { kind: 'toggle' },
  }))
}

/**
 * One row per contributed setting, on its owning plugin's page.
 *
 * @param settings - `usePluginContributions().settings`, already namespaced.
 */
export function pluginPrefSettingDefs(
  settings: readonly ResolvedPluginSetting[],
): SettingDef[] {
  return settings.map((setting) => ({
    key: pluginPrefSettingKey(setting.pluginId, setting.key),
    label: setting.label,
    description: setting.description,
    category: pluginSettingCategory(setting.pluginId),
    control: setting.control,
    default: setting.default,
  }))
}

/**
 * The category tree as drawn, with the Plugins branch filled in.
 *
 * The static tree carries an empty Plugins node; its children depend on what
 * this build ships and what the user has switched on, so they are joined
 * here. A branch with no children at all is dropped, because a tree node that
 * opens an empty page reads as a bug (which is the case in a release build
 * with nothing switchable and nothing contributing).
 *
 * @param staticTree - `CATEGORY_TREE`, left unmodified.
 */
export function buildCategoryTree(
  staticTree: readonly CategoryNode[],
  switchable: readonly RendererPlugin[],
  settings: readonly ResolvedPluginSetting[],
): CategoryNode[] {
  const pages = new Map<string, CategoryNode>()
  for (const setting of settings) {
    if (pages.has(setting.pluginId)) continue
    pages.set(setting.pluginId, {
      id: pluginSettingCategory(setting.pluginId),
      label: setting.pluginName,
      icon: 'settings.plugins',
      children: [],
    })
  }

  return staticTree.flatMap((node) => {
    if (node.id !== PLUGINS_PARENT_CATEGORY) return [node]
    const children = [
      ...(switchable.length > 0
        ? node.children.filter((c) => c.id === PLUGINS_CATEGORY)
        : []),
      ...pages.values(),
    ]
    return children.length > 0 ? [{ ...node, children }] : []
  })
}
