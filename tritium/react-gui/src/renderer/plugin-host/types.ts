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

export type { PluginCommandId, PluginMenuContribution }

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

/** Everything a plugin adds to the shell. */
export interface PluginContributes {
  commands?: PluginCommandDecl[]
  menus?: PluginMenuContribution[]
  toolbar?: PluginToolbarContribution[]
  views?: PluginViewContribution[]
  bottomTabs?: PluginBottomTab[]
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

/** What the shell reads: every enabled plugin's contributions, flattened. */
export interface PluginContributions {
  menus: PluginMenuContribution[]
  toolbar: PluginToolbarContribution[]
  views: ResolvedPluginView[]
  bottomTabs: ResolvedPluginBottomTab[]
}
