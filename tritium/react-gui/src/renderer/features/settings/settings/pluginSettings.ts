/**
 * @file features/settings/settings/pluginSettings.ts
 * @description The Plugins page of the Settings pane: one switch per
 * built-in plugin.
 *
 * Generated from the registry rather than listed by hand, so a new plugin
 * shows up here by existing. The rows are `SettingDef`s like every other
 * setting, but their value does not live in `UiState` under their own key --
 * `SettingsPane` routes a `plugins.` key to the plugin registry, which owns
 * the enabled set.
 */

import type { RendererPlugin } from '@renderer/plugin-host'
import type { SettingDef } from './settingsConfig'

/** Category id of the Plugins page in `CATEGORY_TREE`. */
export const PLUGINS_CATEGORY = 'plugins'

/** Prefix marking a setting key that addresses a plugin's enabled flag. */
export const PLUGIN_SETTING_PREFIX = 'plugins.'

/** The plugin id a `plugins.<id>` key addresses, or null for any other key. */
export function pluginIdFromSettingKey(key: string): string | null {
  return key.startsWith(PLUGIN_SETTING_PREFIX)
    ? key.slice(PLUGIN_SETTING_PREFIX.length)
    : null
}

/** One toggle row per plugin, in registry order. */
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
