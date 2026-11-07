/**
 * @file plugins/pymol-console/manifest.ts
 * @description What the PyM console plugin contributes: a dialect for the Console.
 *
 * Separate from `index.ts` so the id can be imported without pulling the
 * plugin's module tree in with it.
 */

import type { PluginManifest } from '@renderer/plugin-host/api'
import { DIALECT_EXTENSION } from '@plugins/console/shared/dialectMeta'
import { PYMOL_META } from './shared/meta'

export const pymolConsoleManifest: PluginManifest = {
  id: 'pymol-console',
  name: 'PyM console',
  version: '1.0.0',
  description: "Experimental. A PyMOL dialect for the Console: PyMOL's command names, arguments and selections (fetch 1crn, show sticks, resn LYS), translated into CueMol. Needs the Console plugin.",
  // On by default, as the dialect was when it was part of the Console.
  defaultEnabled: true,
  contributes: {
    // The Console reads this; with the Console off it goes nowhere.
    extensions: { [DIALECT_EXTENSION]: [PYMOL_META] },
  },
}
