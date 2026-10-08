/**
 * @file plugins/console/manifest.ts
 * @description What the console plugin contributes.
 *
 * Separate from `index.ts` so the id can be imported without pulling the
 * plugin's React tree in with it.
 */

import type { PluginManifest } from '@renderer/plugin-host/api'
import { CLI_PATH_ROW, CONSOLE_PLUGIN_ID, REMOTE_ACCESS_PREF } from './shared/consoleTypes'

export const consoleManifest: PluginManifest = {
  id: CONSOLE_PLUGIN_ID,
  name: 'Console',
  version: '1.0.0',
  description:
    'Experimental. A command line for CueMol, with a PyMOL-compatible dialect.',
  // On by default: tritium_cli needs it, and a launch from the command line
  // cannot turn a plugin on.
  defaultEnabled: true,
  contributes: {
    statusBar: [{ id: 'cli' }],
    settings: [
      {
        key: REMOTE_ACCESS_PREF,
        label: 'Command line access',
        description:
          'Let the tritium_cli command line run commands in this window, against the ' +
          'active tab. It uses the local server the MCP plugin also uses, and finds the port ' +
          'and token in ~/.cuemol/local-api.json. A CueMol3 started by tritium_cli allows it ' +
          'for that run without changing this setting.',
        control: { kind: 'toggle' },
        default: false,
      },
      {
        key: CLI_PATH_ROW,
        label: 'Command line tool',
        description:
          'tritium_cli runs console commands from a terminal, starting CueMol3 if it is not running.',
        control: { kind: 'custom' },
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
