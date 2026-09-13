/**
 * @file plugins/index.ts
 * @description The built-in plugin registry: every plugin this build ships.
 *
 * Built-in means compiled into the app bundle, not loaded at runtime (see
 * docs/architecture/tritium_plugin/). One directory per plugin, in the
 * layout a runtime-loaded plugin would have, so the move to Phase A of the
 * plugin plan is a packaging change rather than a rewrite.
 *
 * Every plugin listed here ships in every build; what a user sees is decided
 * by the manifest (`defaultEnabled`) and their own choice, not by the build.
 *
 * A plugin that must not ship at all declares `devOnly` and is listed inside
 * an inline `__DEV_UI__` branch, so the bundler can fold the branch away and
 * tree-shake the module out (`selectAvailablePlugins` is the runtime half of
 * the same gate). Nothing needs that today.
 */

import type { RendererPlugin } from '@renderer/plugin-host/api'
import { agentPlugin } from './agent'
import { catalogPlugin } from './catalog'
import { getPdbPlugin } from './getpdb'
import { mdtoolsPlugin } from './mdtools'
import { sequencePlugin } from './sequence'

export const BUILTIN_PLUGINS: readonly RendererPlugin[] = [
  getPdbPlugin,
  sequencePlugin,
  catalogPlugin,
  agentPlugin,
  mdtoolsPlugin,
]
