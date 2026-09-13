/**
 * @file plugins/mdtools/manifest.ts
 * @description What the MD Tools plugin contributes.
 *
 * Separate from `index.ts` so the command id can be imported by the handler
 * without pulling the plugin's React tree in with it.
 */

import type { PluginCommandId, PluginManifest } from '@renderer/plugin-host/api'

/** Opens the Open MD Trajectory dialog and runs the load the user confirms. */
export const OPEN_MD_TRAJ_COMMAND: PluginCommandId = 'plugin.mdtools.openTrajDialog'

export const mdtoolsManifest: PluginManifest = {
  id: 'mdtools',
  name: 'MD Tools',
  version: '1.0.0',
  description:
    'Experimental. Open MD simulation trajectories (topology + DCD/XTC/TRR) and play them back in the Trajectory tab.',
  // Off by default: the feature is experimental and still rough in places,
  // and it is of no use to anyone who does not run MD.
  //
  // The switch gates the GUI alone, because the C++ mdtools module is linked
  // into every build and there is no plugin lane for it yet. Once one exists,
  // the module follows this plugin and the two switch together.
  defaultEnabled: false,
  contributes: {
    commands: [{ id: OPEN_MD_TRAJ_COMMAND, title: 'Open MD Trajectory...' }],
    menus: [
      {
        group: 'file',
        // Where the built-in row used to sit, right after Open File.
        after: 'open-file',
        items: [
          { id: 'open-traj', label: 'Open MD Trajectory...', command: OPEN_MD_TRAJ_COMMAND },
        ],
      },
    ],
    bottomTabs: [
      {
        id: 'trajectory',
        label: 'Trajectory',
        icon: 'panel.trajectory',
        // Where the built-in tab used to sit, after Animation.
        after: 'animation',
      },
    ],
  },
}
