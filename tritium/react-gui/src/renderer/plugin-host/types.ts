/**
 * @file plugin-host/types.ts
 * @description What a built-in plugin declares, and what the shell gets back.
 *
 * A plugin is a manifest plus the React pieces the manifest names. The
 * manifest is plain data in the shape a `plugin.json` would have, so the
 * same declarations survive a later move to a loaded-at-runtime plugin
 * (docs/plans/260908-tritium-plugin-system-plan.md Phase A) without being
 * rewritten.
 */

import type React from 'react'
import type { AppIconKey } from '@renderer/h3-kit/primitives'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { PluginCommandId, PluginMenuContribution } from '@shared/types/pluginContrib'
import type { PluginPrefValue } from '@shared/types/uiPrefs'
import type {
  PluginSettingControl,
  SettingControl,
} from '@renderer/features/settings/settings/settingControl'

export type { PluginCommandId, PluginMenuContribution, PluginSettingControl }

// ------------------------------------------------------------
// Manifest
// ------------------------------------------------------------

/** A command the plugin registers a handler for. */
export interface PluginCommandDecl {
  id: PluginCommandId
  /** Human label. Not shown anywhere yet; a command palette would use it. */
  title: string
}

/** One toolbar button. */
export interface PluginToolbarItem {
  id: string
  icon: AppIconKey
  text: string
  command: PluginCommandId
  /** Disable the button while no molview tab is active. */
  requiresScene?: boolean
}

/**
 * Buttons a plugin adds to the top toolbar. A divider is always drawn ahead
 * of the block, so the group reads as its own section the way the built-in
 * groups do.
 */
export interface PluginToolbarContribution {
  /** Insert after the built-in item with this id; appended when absent. */
  after?: string
  items: PluginToolbarItem[]
}

/** One pane inside a plugin's activity-bar view. */
export interface PluginViewPane {
  id: string
  /** Height used when the user has not dragged the splitter yet. */
  defaultSize: number
}

/** An activity-bar view (a sidebar icon) and the panes stacked inside it. */
export interface PluginViewContribution {
  id: string
  title: string
  icon: AppIconKey
  panes: PluginViewPane[]
}

/** A tab in the bottom panel. */
export interface PluginBottomTab {
  id: string
  label: string
  icon: AppIconKey
  /** Insert after the built-in tab with this id; appended when absent. */
  after?: string
}

/**
 * One row on the plugin's own page in Settings.
 *
 * The value lives in `UiState.pluginPrefs[<plugin id>][key]` and is read back
 * with `usePluginPrefs`, except for a `secret`, whose value never touches
 * that file (see `PluginSettingControl`).
 */
export interface PluginSettingDecl {
  /** Identifier within the plugin. Letters and digits; no dots. */
  key: string
  label: string
  description: string
  control: PluginSettingControl
  /**
   * Value in force until the user changes it. Required for every kind except
   * `secret`, which has no value to default to.
   */
  default?: PluginPrefValue
}

/** Everything a plugin adds to the shell. */
export interface PluginContributes {
  commands?: PluginCommandDecl[]
  menus?: PluginMenuContribution[]
  toolbar?: PluginToolbarContribution[]
  views?: PluginViewContribution[]
  bottomTabs?: PluginBottomTab[]
  settings?: PluginSettingDecl[]
}

/** The static declaration of a plugin. */
export interface PluginManifest {
  /** Lower-case identifier, unique across plugins. Namespaces commands and services. */
  id: string
  name: string
  version: string
  description?: string
  /**
   * Developer-build only. A release build drops the plugin from the registry
   * entirely (see `selectAvailablePlugins`), on top of the `__DEV_UI__`
   * branch in `plugins/index.ts` that lets the bundler tree-shake it.
   */
  devOnly?: boolean
  /**
   * Not switchable: always on, and absent from Settings > Plugins.
   *
   * For a feature that is packaged as a plugin to keep it in one directory,
   * rather than because anyone would want it gone. Turning such a plugin off
   * would only take a working menu item away with nothing gained.
   */
  alwaysEnabled?: boolean
  /**
   * Whether the plugin is on before the user has said anything. Defaults to
   * true; set it false for something the user opts into. Ignored when
   * `alwaysEnabled` is set.
   */
  defaultEnabled?: boolean
  contributes?: PluginContributes
}

// ------------------------------------------------------------
// Components
// ------------------------------------------------------------

/** Props every sidebar pane receives, plugin or built-in. */
export interface PaneComponentProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

export type PaneComponent = React.ComponentType<PaneComponentProps>

/** Props every bottom-panel tab receives, plugin or built-in. */
export interface BottomTabComponentProps {
  cm: AsyncCueMol | null
  activeSceneId?: number
  activeMolViewId?: number
}

export type BottomTabComponent = React.ComponentType<BottomTabComponentProps>

/** A plugin as the host sees it. */
export interface RendererPlugin {
  manifest: PluginManifest
  /**
   * Mounted while the plugin is enabled, rendering nothing of its own. This
   * is where command handlers are registered and where the plugin's dialog
   * providers are mounted, so disabling the plugin takes both away.
   */
  Root?: React.ComponentType
  /** Pane components, keyed by the pane id declared in `contributes.views`. */
  panes?: Record<string, PaneComponent>
  /** Tab components, keyed by the tab id declared in `contributes.bottomTabs`. */
  bottomTabs?: Record<string, BottomTabComponent>
}

// ------------------------------------------------------------
// Resolved contributions (manifest data joined with its components)
// ------------------------------------------------------------

export interface ResolvedPluginPane extends PluginViewPane {
  Component: PaneComponent
}

export interface ResolvedPluginView extends Omit<PluginViewContribution, 'panes'> {
  panes: ResolvedPluginPane[]
}

export interface ResolvedPluginBottomTab extends PluginBottomTab {
  Component: BottomTabComponent
}

/**
 * A settings row with its owner attached, ready for the Settings pane to
 * draw. A `secret` control has had its namespace filled in with the plugin
 * id here, which is what keeps one plugin out of another's keychain entry.
 */
export interface ResolvedPluginSetting extends Omit<PluginSettingDecl, 'control'> {
  pluginId: string
  /** The manifest name, used as the title of the plugin's settings page. */
  pluginName: string
  control: SettingControl
}

/** What the shell reads: every enabled plugin's contributions, flattened. */
export interface PluginContributions {
  menus: PluginMenuContribution[]
  toolbar: PluginToolbarContribution[]
  views: ResolvedPluginView[]
  bottomTabs: ResolvedPluginBottomTab[]
  settings: ResolvedPluginSetting[]
}
