/**
 * @file plugins/getpdb/manifest.ts
 * @description What the Get PDB plugin contributes.
 *
 * Separate from `index.ts` so the command id can be imported by the handler
 * without pulling the plugin's React tree in with it.
 */

import type { PluginCommandId, PluginManifest } from '@renderer/plugin-host/api'

/** Opens the Get PDB dialog and runs the download chain the user confirms. */
export const GET_PDB_COMMAND: PluginCommandId = 'plugin.getpdb.open'

export const getPdbManifest: PluginManifest = {
  id: 'getpdb',
  name: 'Get PDB',
  version: '1.0.0',
  description:
    'Download a structure and its density maps from RCSB or PDBe straight into the scene.',
  // A File menu item and a toolbar button, not an optional extra: switching
  // it off would take a working entry point away and give nothing back. It is
  // a plugin to keep the flow in one directory, not to make it removable.
  alwaysEnabled: true,
  contributes: {
    commands: [{ id: GET_PDB_COMMAND, title: 'Get PDB...' }],
    menus: [
      {
        group: 'file',
        // Right after Open MD Trajectory, where the built-in row used to sit.
        after: 'open-traj',
        items: [{ id: 'get-pdb', label: 'Get PDB...', command: GET_PDB_COMMAND }],
      },
    ],
    toolbar: [
      // A divider is drawn ahead of the block, which restores the separation
      // the static bar used to carry between Save Scene and Render.
      {
        after: 'save-scene',
        items: [
          {
            id: 'get-pdb',
            icon: 'toolbar.getPdb',
            text: 'Get PDB',
            command: GET_PDB_COMMAND,
          },
        ],
      },
    ],
  },
}
