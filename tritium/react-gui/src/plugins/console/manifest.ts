/**
 * @file plugins/console/manifest.ts
 * @description What the console plugin contributes.
 *
 * Separate from `index.ts` so the id can be imported without pulling the
 * plugin's React tree in with it.
 */

import type { PluginManifest } from '@renderer/plugin-host/api'

export const consoleManifest: PluginManifest = {
  id: 'console',
  name: 'Console',
  version: '1.0.0',
  description:
    'Experimental. A command line that understands part of the PyMOL command language.',
  // Off by default: the command coverage is partial and still growing, and
  // the tab is of no use to anyone who does not already know PyMOL.
  defaultEnabled: false,
  contributes: {
    bottomTabs: [
      {
        id: 'console',
        label: 'Console',
        icon: 'panel.console',
        // Next to the Output tab: both are places text scrolls past.
        after: 'output',
      },
    ],
  },
}
