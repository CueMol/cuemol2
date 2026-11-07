/**
 * @file plugins/chimerax-console/manifest.ts
 * @description What the ChX console plugin contributes: a dialect for the Console.
 *
 * Separate from `index.ts` so the id can be imported without pulling the
 * plugin's module tree in with it.
 */

import type { PluginManifest } from '@renderer/plugin-host/api'
import { DIALECT_EXTENSION } from '@plugins/console/shared/dialectMeta'
import { CHIMERAX_META } from './shared/meta'

export const chimeraxConsoleManifest: PluginManifest = {
  id: 'chimerax-console',
  name: 'ChX console',
  version: '1.0.0',
  description: "Experimental. A ChimeraX dialect for the Console: ChimeraX's command names, arguments and atom specifications (open 1crn, color byhetero, show :ALA atoms), translated into CueMol. Needs the Console plugin.",
  // On by default, as the dialect was when it was part of the Console.
  defaultEnabled: true,
  contributes: {
    // The Console reads this; with the Console off it goes nowhere.
    extensions: { [DIALECT_EXTENSION]: [CHIMERAX_META] },
  },
}
