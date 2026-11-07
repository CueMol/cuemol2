/**
 * @file plugins/chimerax-console/index.ts
 * @description The ChX console plugin: adds a dialect to the Console.
 *
 * Nothing of its own is drawn. The manifest declares the dialect to the
 * Console's `console.dialect` extension point (its switch, prompt and
 * history); the worker half (`worker/dialect.service.ts`) registers the
 * implementation through the Console's `dialect-api`. Switching the plugin
 * off takes the dialect out of the Console's switch and `tritium_cli`.
 */

import { definePlugin } from '@renderer/plugin-host/api'
import { chimeraxConsoleManifest } from './manifest'

export const chimeraxConsolePlugin = /* @__PURE__ */ definePlugin({
  manifest: chimeraxConsoleManifest,
})
