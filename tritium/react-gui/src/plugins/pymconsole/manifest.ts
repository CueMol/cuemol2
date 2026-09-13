/**
 * @file plugins/pymconsole/manifest.ts
 * @description What the PyMOL console plugin contributes.
 *
 * Separate from `index.ts` so the id can be imported without pulling the
 * plugin's React tree in with it.
 */

import type { PluginManifest } from '@renderer/plugin-host/api'

export const pymConsoleManifest: PluginManifest = {
  id: 'pymconsole',
  name: 'PyMOL Console',
  version: '1.0.0',
  description:
    'Experimental. A command line that understands part of the PyMOL command language.',
  // Off by default: the command coverage is partial and still growing, and
  // the tab is of no use to anyone who does not already know PyMOL.
  defaultEnabled: false,
  contributes: {
    bottomTabs: [
      {
        id: 'pymconsole',
        label: 'PyMOL',
        icon: 'panel.pymconsole',
        // Next to the Output tab: both are places text scrolls past.
        after: 'output',
      },
    ],
  },
}
