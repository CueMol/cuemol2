/**
 * @file worker/server/catalog/toolsets.ts
 * @description The groups a tool caller can switch on beyond the core tools.
 *
 * A model picks tools less reliably as the list grows (OpenAI's guidance is
 * about twenty), while the catalogue only grows. So an op offered as a tool
 * is either `core` -- always in the list, chosen for how often it is needed --
 * or belongs to one of these toolsets, which the model switches on when a
 * request needs it (the AI agent's `enable_toolsets`). A console sees every
 * op regardless: it has no list to keep short.
 */

/** The toolsets there are. */
export type ToolsetId =
  | 'analysis'
  | 'files'
  | 'coloring'
  | 'view'
  | 'map'
  | 'molops'
  | 'xtal'
  | 'style'
  | 'selection'
  | 'render'
  | 'anim'

export interface Toolset {
  id: ToolsetId
  /** When to switch it on; the model reads this to decide. */
  description: string
}

/** Every toolset, in the order they are listed to a model. */
export const TOOLSETS: readonly Toolset[] = [
  {
    id: 'analysis',
    description:
      'Measuring and analysing: distances, angles and torsions between named atoms, ' +
      'close contacts around a selection, and listing the residues of a chain.',
  },
  {
    id: 'files',
    description:
      'Files on this computer: opening a structure file the user named, and saving a PNG ' +
      'of the view to the desktop. (Downloading from the PDB is always available.)',
  },
  {
    id: 'coloring',
    description:
      'More colouring: the named styles set_renderer_coloring accepts, clearing painted ' +
      'regions, and a painted renderer\'s base colour.',
  },
  {
    id: 'view',
    description:
      'Camera: saving and restoring named views, perspective or orthographic projection, ' +
      'sliding the view, and fitting it to one object or renderer.',
  },
  {
    id: 'map',
    description: 'Electron density maps: fetching a PDB entry\'s map, and setting contour level, extent and colour.',
  },
  {
    id: 'molops',
    description:
      'Changing molecules: superposing one onto another, molecular surfaces, deleting atoms, ' +
      'renaming chains, merging molecules, and secondary structure.',
  },
  {
    id: 'xtal',
    description: 'Crystal structures: symmetry mates and the unit cell.',
  },
  {
    id: 'style',
    description: 'Named renderer styles (preset looks and outlines).',
  },
  {
    id: 'selection',
    description: 'Naming a selection expression for later use.',
  },
  {
    id: 'render',
    description:
      'High-quality rendering: ray-traced images with global illumination or a hatched ' +
      'illustration style, saved as PNG (like PyMOL ray).',
  },
  {
    id: 'anim',
    description: 'Playing the scene\'s animation.',
  },
]
