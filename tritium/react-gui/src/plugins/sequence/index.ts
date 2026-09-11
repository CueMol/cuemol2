/**
 * @file plugins/sequence/index.ts
 * @description The Sequence panel plugin: a chain-by-residue grid of every
 * molecule in the scene, with selection kept in sync both ways.
 *
 * The one plugin that brings its own worker services. They reach C++ through
 * generic API only -- `MolCoord` chain and residue iteration, `ResidRangeSet`,
 * `mol.sel` and `view.setViewCenter` -- so nothing here depends on a class
 * that exists for this panel.
 *
 * Its stylesheet is imported from this entry rather than from `app.css`, so
 * dropping the plugin drops the CSS with it.
 */

import { definePlugin } from '@renderer/plugin-host/api'
import { SequencePanel } from './renderer/SequencePanel'
import './renderer/sequence-panel.css'

export const sequencePlugin = /* @__PURE__ */ definePlugin({
  manifest: {
    id: 'sequence',
    name: 'Sequence Panel',
    version: '1.0.0',
    description: 'Residue grid of every molecule in the scene, with two-way selection sync.',
    contributes: {
      bottomTabs: [
        {
          id: 'sequence',
          label: 'Sequence',
          icon: 'panel.sequence',
          // Where the built-in tab used to sit, between Output and Animation.
          after: 'output',
        },
      ],
    },
  },
  bottomTabs: {
    sequence: SequencePanel,
  },
})
