/**
 * @file plugins/index.ts
 * @description The built-in plugin registry: every plugin this build ships.
 *
 * Built-in means compiled into the app bundle, not loaded at runtime (see
 * docs/architecture/tritium-plugin-host.md). One directory per plugin, in the
 * layout a runtime-loaded plugin would have, so the move to Phase A of the
 * plugin plan is a packaging change rather than a rewrite.
 *
 * `__DEV_UI__` is referenced inline rather than through a constant so the
 * bundler can fold the branch away and tree-shake a developer-only plugin out
 * of a release build entirely. `selectAvailablePlugins` applies the same gate
 * at runtime, which is the half a test can reach.
 */

import type { RendererPlugin } from '@renderer/plugin-host/api'
import { catalogPlugin } from './catalog'
import { getPdbPlugin } from './getpdb'
import { sequencePlugin } from './sequence'

export const BUILTIN_PLUGINS: readonly RendererPlugin[] = [
  getPdbPlugin,
  sequencePlugin,
  ...(__DEV_UI__ ? [catalogPlugin] : []),
]
