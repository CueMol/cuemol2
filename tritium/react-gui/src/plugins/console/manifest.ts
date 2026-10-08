/**
 * @file plugins/console/manifest.ts
 * @description What the console plugin contributes.
 *
 * Separate from `index.ts` so the id can be imported without pulling the
 * plugin's React tree in with it.
 */

import type { PluginManifest } from '@renderer/plugin-host/api'
import { CONSOLE_PLUGIN_ID, REMOTE_ACCESS_PREF } from './shared/consoleTypes'

export const consoleManifest: PluginManifest = {
  id: CONSOLE_PLUGIN_ID,
  name: 'Console',
  version: '1.0.0',
  description:
    'Experimental. A command line for CueMol, with a PyMOL-compatible dialect.',
  // Off by default: the command coverage is still growing, and the tab is of
  // no use to anyone who would rather work from the menus.
  defaultEnabled: false,
  contributes: {
    settings: [
      {
        key: REMOTE_ACCESS_PREF,
        label: 'Command line access',
        description:
          'Let the cuemol-console command line run commands in this window, against the ' +
          'active tab. It uses the local server the MCP plugin also uses, and finds the port ' +
          'and token in ~/.cuemol/local-api.json.',
        control: { kind: 'toggle' },
        default: false,
      },
    ],
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
