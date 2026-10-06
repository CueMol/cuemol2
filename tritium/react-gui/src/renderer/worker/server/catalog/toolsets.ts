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
export type ToolsetId = 'analysis'

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
      'close contacts around a selection, and saving a PNG of the view to the desktop.',
  },
]
